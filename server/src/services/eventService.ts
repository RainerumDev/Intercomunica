import type { Event, EventTag, EventSubgroup, Tag } from "@prisma/client";
import { prisma } from "../db.js";
import {
  insertEvent,
  updateEvent as gUpdateEvent,
  deleteEvent as gDeleteEvent,
  isWritableCalendarAccessRole,
  type CalendarEventPayload,
} from "../google/calendar.js";

export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  isGlobal: boolean;
  bachecaOnly: boolean;
  subgroupIds: string[];
  tagNames: string[];
}

type EventWithRelations = Event & {
  tags: (EventTag & { tag: Tag })[];
  subgroups: EventSubgroup[];
};

interface EventOperationOptions {
  skipGeneral?: boolean;
}

export class ReadOnlyGeneralCalendarError extends Error {
  constructor() {
    super("Il calendario generale è in sola lettura: l'evento non può essere eliminato da Intercomunica");
    this.name = "ReadOnlyGeneralCalendarError";
  }
}

/** Build the Google Calendar payload for a DB event. */
export function eventToCalendarPayload(event: EventWithRelations): CalendarEventPayload {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    appEventId: event.id,
    subgroupIds: event.subgroups.map((s) => s.subgroupId),
    tagNames: event.tags.map((t) => t.tag.name),
  };
}

/** Upsert tags by name, return Tag ids. */
async function ensureTags(tagNames: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const raw of tagNames) {
    const name = raw.trim().toUpperCase();
    if (!name) continue;
    const tag = await prisma.tag.upsert({ where: { name }, create: { name }, update: {} });
    ids.push(tag.id);
  }
  return [...new Set(ids)];
}

async function loadEvent(eventId: string): Promise<EventWithRelations> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { tags: { include: { tag: true } }, subgroups: true },
  });
  return event;
}

/**
 * Flusso 3 — create event.
 * Every event is copied to the general calendar unless it came from that calendar.
 */
export async function createEvent(
  input: EventInput,
  createdById?: string,
  options: EventOperationOptions = {}
): Promise<EventWithRelations> {
  const tagIds = await ensureTags(input.tagNames);
  const event = await prisma.event.create({
    data: {
      title: input.title,
      description: input.description,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      isGlobal: input.isGlobal,
      bachecaOnly: input.bachecaOnly,
      createdById,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
      subgroups: { create: input.subgroupIds.map((subgroupId) => ({ subgroupId })) },
    },
  });

  if (!options.skipGeneral) await ensureGeneralCopy(event.id);
  return loadEvent(event.id);
}

/**
 * Flusso 3 — update the database event and its general-calendar copy.
 */
export async function updateEvent(
  eventId: string,
  input: EventInput,
  options: EventOperationOptions = {}
): Promise<EventWithRelations> {
  const tagIds = await ensureTags(input.tagNames);
  await prisma.event.update({
    where: { id: eventId },
    data: {
      title: input.title,
      description: input.description,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      isGlobal: input.isGlobal,
      bachecaOnly: input.bachecaOnly,
      tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) },
      subgroups: { deleteMany: {}, create: input.subgroupIds.map((subgroupId) => ({ subgroupId })) },
    },
  });

  if (!options.skipGeneral) await ensureGeneralCopy(eventId);
  return loadEvent(eventId);
}

/** Flusso 3 — delete the general copy first, then use the DB cascade locally. */
export async function deleteEventEverywhere(
  eventId: string,
  options: EventOperationOptions = {}
): Promise<void> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  if (!options.skipGeneral && event.generalGoogleEventId) {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (cfg?.generalCalendarId) {
      if (!isWritableCalendarAccessRole(cfg.generalCalendarAccessRole)) {
        throw new ReadOnlyGeneralCalendarError();
      }
      await gDeleteEvent(cfg.generalCalendarId, event.generalGoogleEventId);
    }
  }
  await prisma.event.delete({ where: { id: eventId } });
}

export async function ensureGeneralCopy(eventId: string): Promise<void> {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (
    !cfg?.generalCalendarId ||
    !isWritableCalendarAccessRole(cfg.generalCalendarAccessRole)
  ) return;
  const event = await loadEvent(eventId);
  const payload = eventToCalendarPayload(event);
  if (event.generalGoogleEventId) {
    try {
      await gUpdateEvent(cfg.generalCalendarId, event.generalGoogleEventId, payload);
      return;
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code !== 404 && code !== 410) throw err;
    }
  }
  const googleEventId = await insertEvent(cfg.generalCalendarId, payload);
  await prisma.event.update({ where: { id: eventId }, data: { generalGoogleEventId: googleEventId } });
}
