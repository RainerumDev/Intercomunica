import { prisma } from "../db.js";
import { listGroupMembers } from "../google/directory.js";
import { deleteCalendar } from "../google/calendar.js";
import { isCalendarUsageLimitError } from "../google/retry.js";

const CALENDAR_MUTATION_DELAY_MS = 750;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SyncResult {
  added: string[];
  deactivated: string[];
  reactivated: string[];
  calendarsRemoved: string[];
  calendarsPending: string[];
  errors: string[];
}

export interface LegacyCalendarUser {
  id: string;
  email: string;
  calendarId: string;
}

export interface RetirementDependencies {
  deleteCalendar: (calendarId: string) => Promise<void>;
  finalizeUser: (userId: string) => Promise<void>;
  pause: (milliseconds: number) => Promise<void>;
  isUsageLimit: (error: unknown) => boolean;
}

const USAGE_LIMIT_MESSAGE =
  "Google Calendar ha applicato un limite operativo temporaneo. " +
  "Sincronizzazione interrotta senza perdere i progressi; attendere alcune ore e riprovare.";

export async function retireLegacyCalendars(
  users: LegacyCalendarUser[],
  dependencies: RetirementDependencies
): Promise<Pick<SyncResult, "calendarsRemoved" | "calendarsPending" | "errors">> {
  const calendarsRemoved: string[] = [];
  const calendarsPending: string[] = [];
  const errors: string[] = [];

  for (const [index, user] of users.entries()) {
    try {
      await dependencies.deleteCalendar(user.calendarId);
      await dependencies.finalizeUser(user.id);
    } catch (error) {
      calendarsPending.push(user.email);
      if (dependencies.isUsageLimit(error)) {
        calendarsPending.push(...users.slice(index + 1).map((pending) => pending.email));
        errors.push(USAGE_LIMIT_MESSAGE);
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`calendario ${user.email}: ${message}`);
      continue;
    }
    calendarsRemoved.push(user.email);
    await dependencies.pause(CALENDAR_MUTATION_DELAY_MS);
  }

  return { calendarsRemoved, calendarsPending, errors };
}

/**
 * Flusso 1.4 — "Sincronizza / Refresh".
 * 1. Align Users with the members of the main Google Group (add new, deactivate removed).
 * 2. Delete every remaining legacy personal calendar and finalize its local state.
 */
export async function runFullSync(): Promise<SyncResult> {
  const log = await prisma.syncLog.create({ data: { type: "group-sync" } });
  const result: SyncResult = {
    added: [],
    deactivated: [],
    reactivated: [],
    calendarsRemoved: [],
    calendarsPending: [],
    errors: [],
  };

  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (!cfg?.mainGroupEmail) throw new Error("Gruppo Google principale non configurato");

    // --- 1. membership alignment -------------------------------------------
    // The master account orchestrates the calendars: if it appears among the
    // group members, never treat it as a teacher (no User, no calendar).
    const masterEmail = cfg.masterEmail?.toLowerCase();
    const members = (await listGroupMembers(cfg.mainGroupEmail)).filter(
      (m) => m.email !== masterEmail
    );
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

    // --- 2. legacy calendar retirement -------------------------------------
    const legacyUsers = await prisma.user.findMany({
      where: { calendarId: { not: null } },
      select: { id: true, email: true, calendarId: true },
    });
    const retirement = await retireLegacyCalendars(
      legacyUsers.map((user) => ({
        id: user.id,
        email: user.email,
        calendarId: user.calendarId as string,
      })),
      {
        deleteCalendar,
        finalizeUser: async (userId) => {
          await prisma.$transaction([
            prisma.eventInstance.deleteMany({ where: { userId } }),
            prisma.user.update({
              where: { id: userId },
              data: { calendarId: null, calendarName: null },
            }),
          ]);
        },
        pause,
        isUsageLimit: isCalendarUsageLimitError,
      }
    );
    result.calendarsRemoved = retirement.calendarsRemoved;
    result.calendarsPending = retirement.calendarsPending;
    result.errors.push(...retirement.errors);

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
