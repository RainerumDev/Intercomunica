import { randomBytes, randomUUID } from "node:crypto";
import type { calendar_v3 } from "googleapis";
import { prisma } from "../db.js";
import { config } from "../config.js";
import {
  fromGoogleEvent,
  listCalendarChanges,
  stopCalendarWatch,
  watchCalendar,
} from "../google/calendar.js";
import {
  createEvent,
  deleteEventEverywhere,
  ensureGeneralCopy,
  updateEvent,
} from "./eventService.js";

const INITIAL_SYNC_DAYS = 30;
const WATCH_RENEWAL_MARGIN_MS = 24 * 60 * 60 * 1000;
let runningSync: Promise<GeneralCalendarSyncResult> | null = null;

export interface GeneralCalendarSyncResult {
  imported: number;
  updated: number;
  deleted: number;
}

export function initialSyncTimeMin(now = new Date()): Date {
  return new Date(now.getTime() - INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000);
}

export function importedEventDefaults() {
  return { isGlobal: true, bachecaOnly: false, subgroupIds: [] as string[] };
}

export function distributionForGoogleEvent(
  appEventId: string | undefined,
  linked?: { isGlobal: boolean; bachecaOnly: boolean; subgroupIds: string[] }
) {
  return appEventId && linked
    ? {
        isGlobal: linked.isGlobal,
        bachecaOnly: linked.bachecaOnly,
        subgroupIds: linked.subgroupIds,
      }
    : importedEventDefaults();
}

async function applyGoogleEvent(source: calendar_v3.Schema$Event) {
  if (!source.id) return "ignored" as const;
  if (source.status === "cancelled") {
    const existing = await prisma.event.findUnique({ where: { generalGoogleEventId: source.id } });
    if (!existing) return "ignored" as const;
    await deleteEventEverywhere(existing.id, { skipGeneral: true });
    return "deleted" as const;
  }

  const imported = fromGoogleEvent(source);
  if (!imported) return "ignored" as const;
  const linked = await prisma.event.findFirst({
    where: {
      OR: [
        { generalGoogleEventId: imported.googleEventId },
        ...(imported.appEventId ? [{ id: imported.appEventId }] : []),
      ],
    },
    include: { subgroups: true },
  });
  const distribution = distributionForGoogleEvent(
    imported.appEventId,
    linked
      ? {
          isGlobal: linked.isGlobal,
          bachecaOnly: linked.bachecaOnly,
          subgroupIds: linked.subgroups.map((entry) => entry.subgroupId),
        }
      : undefined
  );
  const input = {
    title: imported.title,
    description: imported.description,
    location: imported.location,
    startsAt: imported.startsAt,
    endsAt: imported.endsAt,
    allDay: imported.allDay,
    ...distribution,
    tagNames: imported.tagNames,
  };

  if (linked) {
    await prisma.event.update({
      where: { id: linked.id },
      data: {
        generalGoogleEventId: imported.googleEventId,
        googleOccurrenceKey: imported.occurrenceKey,
      },
    });
    await updateEvent(linked.id, input, { skipGeneral: true });
    return "updated" as const;
  }

  const created = await createEvent(input, undefined, { skipGeneral: true });
  await prisma.event.update({
    where: { id: created.id },
    data: {
      generalGoogleEventId: imported.googleEventId,
      googleOccurrenceKey: imported.occurrenceKey,
    },
  });
  return "imported" as const;
}

async function performGeneralCalendarSync(): Promise<GeneralCalendarSyncResult> {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.generalCalendarId) throw new Error("Calendario generale non configurato");
  const result: GeneralCalendarSyncResult = { imported: 0, updated: 0, deleted: 0 };
  try {
    let changes;
    try {
      changes = await listCalendarChanges(cfg.generalCalendarId, cfg.generalCalendarSyncToken
        ? { syncToken: cfg.generalCalendarSyncToken }
        : { timeMin: initialSyncTimeMin() });
    } catch (err) {
      const code = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
      if (code !== 410 || !cfg.generalCalendarSyncToken) throw err;
      changes = await listCalendarChanges(cfg.generalCalendarId, { timeMin: initialSyncTimeMin() });
    }

    for (const item of changes.items) {
      const outcome = await applyGoogleEvent(item);
      if (outcome !== "ignored") result[outcome]++;
    }
    const unlinkedEvents = await prisma.event.findMany({
      where: { generalGoogleEventId: null },
      select: { id: true },
    });
    for (const event of unlinkedEvents) await ensureGeneralCopy(event.id);
    await prisma.appConfig.update({
      where: { id: 1 },
      data: {
        generalCalendarSyncToken: changes.nextSyncToken,
        generalCalendarLastSyncAt: new Date(),
        generalCalendarLastError: null,
      },
    });
    return result;
  } catch (err) {
    await prisma.appConfig.update({
      where: { id: 1 },
      data: { generalCalendarLastError: (err as Error).message },
    });
    throw err;
  }
}

export function syncGeneralCalendar(): Promise<GeneralCalendarSyncResult> {
  if (!runningSync) {
    runningSync = performGeneralCalendarSync().finally(() => {
      runningSync = null;
    });
  }
  return runningSync;
}

export async function configureGeneralCalendar(calendarId: string): Promise<void> {
  const previous = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (previous?.generalCalendarChannelId && previous.generalCalendarResourceId) {
    await stopCalendarWatch(previous.generalCalendarChannelId, previous.generalCalendarResourceId);
  }
  await prisma.appConfig.upsert({
    where: { id: 1 },
    create: { id: 1, generalCalendarId: calendarId },
    update: {
      generalCalendarId: calendarId,
      generalCalendarSyncToken: null,
      generalCalendarChannelId: null,
      generalCalendarResourceId: null,
      generalCalendarChannelToken: null,
      generalCalendarChannelExpiresAt: null,
      generalCalendarLastSyncAt: null,
      generalCalendarLastError: null,
    },
  });
  await syncGeneralCalendar();
  await ensureGeneralCalendarWatch(true);
}

export async function ensureGeneralCalendarWatch(force = false): Promise<void> {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.generalCalendarId) return;
  const validUntil = cfg.generalCalendarChannelExpiresAt?.getTime() ?? 0;
  if (!force && validUntil > Date.now() + WATCH_RENEWAL_MARGIN_MS) return;
  if (cfg.generalCalendarChannelId && cfg.generalCalendarResourceId) {
    await stopCalendarWatch(cfg.generalCalendarChannelId, cfg.generalCalendarResourceId);
  }
  const channelId = randomUUID();
  const channelToken = randomBytes(32).toString("hex");
  const watched = await watchCalendar(
    cfg.generalCalendarId,
    channelId,
    channelToken,
    `${config().BASE_URL}/api/google-calendar/webhook`
  );
  await prisma.appConfig.update({
    where: { id: 1 },
    data: {
      generalCalendarChannelId: channelId,
      generalCalendarResourceId: watched.resourceId,
      generalCalendarChannelToken: channelToken,
      generalCalendarChannelExpiresAt: watched.expiration,
    },
  });
}

export function startGeneralCalendarScheduler(): NodeJS.Timeout {
  const run = async () => {
    try {
      await ensureGeneralCalendarWatch();
      const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
      if (cfg?.generalCalendarId) await syncGeneralCalendar();
    } catch (err) {
      console.error("Sincronizzazione calendario generale fallita:", (err as Error).message);
    }
  };
  void run();
  return setInterval(() => void run(), 15 * 60 * 1000);
}
