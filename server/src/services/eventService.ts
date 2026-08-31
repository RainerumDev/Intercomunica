import type { Event, EventTag, EventSubgroup, Tag } from "@prisma/client";
import { prisma } from "../db.js";
import {
  insertEvent,
  updateEvent as gUpdateEvent,
  deleteEvent as gDeleteEvent,
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

/** Build the Google Calendar payload for a DB event (used by create/update/reconcile). */
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

/** Distinct active teachers (with a calendar) belonging to any of the subgroups. */
export async function targetUsers(subgroupIds: string[]) {
  if (subgroupIds.length === 0) return [];
  return prisma.user.findMany({
    where: {
      isActive: true,
      calendarId: { not: null },
      subgroups: { some: { subgroupId: { in: subgroupIds } } },
    },
  });
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
 * Every event is copied to the general calendar. Non-bacheca-only events are also injected
 * into every target teacher calendar.
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
  if (!input.bachecaOnly) {
    await injectForTargets(event.id);
  }
  return loadEvent(event.id);
}

/** Insert the event into every target calendar that doesn't have it yet. */
export async function injectForTargets(eventId: string): Promise<void> {
  const event = await loadEvent(eventId);
  const payload = eventToCalendarPayload(event);
  const targets = event.isGlobal
    ? await prisma.user.findMany({ where: { isActive: true, calendarId: { not: null } } })
    : await targetUsers(event.subgroups.map((s) => s.subgroupId));
  const existing = await prisma.eventInstance.findMany({ where: { eventId } });
  const existingUserIds = new Set(existing.map((i) => i.userId));

  for (const user of targets) {
    if (existingUserIds.has(user.id)) continue;
    const googleEventId = await insertEvent(user.calendarId as string, payload);
    await prisma.eventInstance.create({
      data: { eventId, userId: user.id, calendarId: user.calendarId as string, googleEventId },
    });
  }
}

/**
 * Flusso 3 — update event. Diffs targets:
 * removed teachers → delete Google copy; kept → update; new → insert.
 * isGlobal true → every active teacher is a target.
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

  const event = await loadEvent(eventId);
  const payload = eventToCalendarPayload(event);
  const instances = await prisma.eventInstance.findMany({ where: { eventId } });
  if (!options.skipGeneral) await ensureGeneralCopy(eventId);

  if (input.bachecaOnly) {
    // bachecaOnly -> remove every injected copy
    for (const inst of instances) {
      await gDeleteEvent(inst.calendarId, inst.googleEventId);
      await prisma.eventInstance.delete({ where: { id: inst.id } });
    }
    return event;
  }

  const targets = input.isGlobal
    ? await prisma.user.findMany({ where: { isActive: true, calendarId: { not: null } } })
    : await targetUsers(input.subgroupIds);
  const targetIds = new Set(targets.map((u) => u.id));

  for (const inst of instances) {
    if (!targetIds.has(inst.userId)) {
      await gDeleteEvent(inst.calendarId, inst.googleEventId);
      await prisma.eventInstance.delete({ where: { id: inst.id } });
    } else {
      await gUpdateEvent(inst.calendarId, inst.googleEventId, payload);
    }
  }
  await injectForTargets(eventId);
  return loadEvent(eventId);
}

/** Flusso 3 — delete event everywhere (Google first, then DB cascade). */
export async function deleteEventEverywhere(
  eventId: string,
  options: EventOperationOptions = {}
): Promise<void> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const instances = await prisma.eventInstance.findMany({ where: { eventId } });
  for (const inst of instances) {
    await gDeleteEvent(inst.calendarId, inst.googleEventId);
  }
  if (!options.skipGeneral && event.generalGoogleEventId) {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (cfg?.generalCalendarId) {
      await gDeleteEvent(cfg.generalCalendarId, event.generalGoogleEventId);
    }
  }
  await prisma.event.delete({ where: { id: eventId } });
}

export async function ensureGeneralCopy(eventId: string): Promise<void> {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.generalCalendarId) return;
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
