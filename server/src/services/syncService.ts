import { prisma } from "../db.js";
import { listGroupMembers } from "../google/directory.js";
import { createTeacherCalendar, listAppEvents, insertEvent, deleteEvent } from "../google/calendar.js";
import { eventToCalendarPayload } from "./eventService.js";

export interface SyncResult {
  added: string[];
  deactivated: string[];
  reactivated: string[];
  calendarsCreated: string[];
  eventsReinjected: number;
  orphansRemoved: number;
  errors: string[];
}

/**
 * Flusso 1.4 — "Sincronizza / Refresh".
 * 1. Align Users with the members of the main Google Group (add new, deactivate removed).
 * 2. Ensure every active member has a dedicated shared calendar.
 * 3. Reconcile events: DB EventInstances vs actual Google events (re-inject missing, delete orphans).
 */
export async function runFullSync(): Promise<SyncResult> {
  const log = await prisma.syncLog.create({ data: { type: "group-sync" } });
  const result: SyncResult = {
    added: [],
    deactivated: [],
    reactivated: [],
    calendarsCreated: [],
    eventsReinjected: 0,
    orphansRemoved: 0,
    errors: [],
  };

  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (!cfg?.mainGroupEmail) throw new Error("Gruppo Google principale non configurato");

    // --- 1. membership alignment -------------------------------------------
    const members = await listGroupMembers(cfg.mainGroupEmail);
    const memberEmails = new Set(members.map((m) => m.email));
    const existing = await prisma.user.findMany();
    const existingByEmail = new Map(existing.map((u) => [u.email, u]));

    for (const m of members) {
      const found = existingByEmail.get(m.email);
      if (!found) {
        await prisma.user.create({ data: { email: m.email, name: m.name } });
        result.added.push(m.email);
      } else if (!found.isActive) {
        await prisma.user.update({ where: { id: found.id }, data: { isActive: true } });
        result.reactivated.push(m.email);
      }
    }
    for (const u of existing) {
      if (u.isActive && !memberEmails.has(u.email)) {
        await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
        result.deactivated.push(u.email);
      }
    }

    // --- 2. calendars for every active member ------------------------------
    const active = await prisma.user.findMany({ where: { isActive: true } });
    for (const u of active) {
      if (!u.calendarId) {
        try {
          const calendarId = await createTeacherCalendar(u.email, u.name ?? u.email);
          await prisma.user.update({ where: { id: u.id }, data: { calendarId } });
          result.calendarsCreated.push(u.email);
        } catch (err) {
          result.errors.push(`calendario ${u.email}: ${(err as Error).message}`);
        }
      }
    }

    // --- 3. event reconciliation -------------------------------------------
    const recon = await reconcileEvents();
    result.eventsReinjected = recon.reinjected;
    result.orphansRemoved = recon.orphansRemoved;
    result.errors.push(...recon.errors);

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: result.errors.length > 0 ? "ERROR" : "SUCCESS",
        message: result.errors.length > 0 ? result.errors.join("; ") : "OK",
        detail: result as object,
        finishedAt: new Date(),
      },
    });
    return result;
  } catch (err) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "ERROR", message: (err as Error).message, finishedAt: new Date() },
    });
    throw err;
  }
}

/**
 * Verify DB ↔ Google Calendar integrity for every active teacher:
 * - EventInstance without a matching Google event → re-insert it.
 * - App-tagged Google event without a matching EventInstance → delete it.
 */
export async function reconcileEvents(): Promise<{ reinjected: number; orphansRemoved: number; errors: string[] }> {
  let reinjected = 0;
  let orphansRemoved = 0;
  const errors: string[] = [];

  const users = await prisma.user.findMany({
    where: { isActive: true, calendarId: { not: null } },
    include: {
      eventInstances: {
        include: { event: { include: { tags: { include: { tag: true } }, subgroups: true } } },
      },
    },
  });

  for (const u of users) {
    const calendarId = u.calendarId as string;
    try {
      const googleEvents = await listAppEvents(calendarId);
      const googleById = new Map(googleEvents.map((g) => [g.googleEventId, g]));
      const instanceByGoogleId = new Map(u.eventInstances.map((i) => [i.googleEventId, i]));

      // re-inject missing
      for (const inst of u.eventInstances) {
        if (!googleById.has(inst.googleEventId)) {
          const payload = eventToCalendarPayload(inst.event);
          const newGoogleId = await insertEvent(calendarId, payload);
          await prisma.eventInstance.update({
            where: { id: inst.id },
            data: { googleEventId: newGoogleId, calendarId },
          });
          reinjected++;
        }
      }
      // remove orphans
      for (const g of googleEvents) {
        if (!instanceByGoogleId.has(g.googleEventId)) {
          await deleteEvent(calendarId, g.googleEventId);
          orphansRemoved++;
        }
      }
    } catch (err) {
      errors.push(`riconciliazione ${u.email}: ${(err as Error).message}`);
    }
  }

  return { reinjected, orphansRemoved, errors };
}
