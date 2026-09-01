import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacyCalendarUser, RetirementDependencies } from "./syncService.js";
import { retireLegacyCalendars, runFullSync } from "./syncService.js";
import { isCalendarUsageLimitError, withRetry } from "../google/retry.js";

const db = vi.hoisted(() => ({
  syncLogCreate: vi.fn(),
  syncLogUpdate: vi.fn(),
  appConfigFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  eventInstanceDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

const google = vi.hoisted(() => ({
  listGroupMembers: vi.fn(),
  deleteCalendar: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: {
    syncLog: { create: db.syncLogCreate, update: db.syncLogUpdate },
    appConfig: { findUnique: db.appConfigFindUnique },
    user: {
      findMany: db.userFindMany,
      create: db.userCreate,
      update: db.userUpdate,
    },
    eventInstance: { deleteMany: db.eventInstanceDeleteMany },
    $transaction: db.transaction,
  },
}));

vi.mock("../google/directory.js", () => ({
  listGroupMembers: google.listGroupMembers,
}));

vi.mock("../google/calendar.js", () => ({
  deleteCalendar: google.deleteCalendar,
}));

const users: LegacyCalendarUser[] = [
  { id: "user-1", email: "prima@rainerum.it", calendarId: "calendar-1" },
  { id: "user-2", email: "seconda@rainerum.it", calendarId: "calendar-2" },
  { id: "user-3", email: "terza@rainerum.it", calendarId: "calendar-3" },
];

function gaxios403(reason: string) {
  return Object.assign(new Error(reason), {
    status: 403,
    response: {
      data: {
        error: { errors: [{ reason }] },
      },
    },
  });
}

function dependencies(
  overrides: Partial<RetirementDependencies> = {}
): RetirementDependencies {
  return {
    deleteCalendar: vi.fn().mockResolvedValue(undefined),
    finalizeUser: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    isUsageLimit: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of [...Object.values(db), ...Object.values(google)]) mock.mockReset();
  db.syncLogCreate.mockResolvedValue({ id: "sync-1" });
  db.syncLogUpdate.mockResolvedValue({ id: "sync-1" });
  db.appConfigFindUnique.mockResolvedValue({
    mainGroupEmail: "docenti@rainerum.it",
    masterEmail: "master@rainerum.it",
  });
  db.userCreate.mockResolvedValue({});
  db.userUpdate.mockResolvedValue({});
  db.eventInstanceDeleteMany.mockReturnValue({ operation: "delete-instances" });
  db.transaction.mockResolvedValue([]);
  google.listGroupMembers.mockResolvedValue([]);
  google.deleteCalendar.mockResolvedValue(undefined);
});

describe("legacy personal calendar retirement", () => {
  it("removes a whole calendar before clearing its database references", async () => {
    const calls: string[] = [];
    const deps = dependencies({
      deleteCalendar: vi.fn(async (calendarId) => {
        calls.push(`delete:${calendarId}`);
      }),
      finalizeUser: vi.fn(async (userId) => {
        calls.push(`finalize:${userId}`);
      }),
    });

    const result = await retireLegacyCalendars([users[0]], deps);

    expect(result).toEqual({
      calendarsRemoved: ["prima@rainerum.it"],
      calendarsPending: [],
      errors: [],
    });
    expect(calls).toEqual(["delete:calendar-1", "finalize:user-1"]);
    expect(deps.pause).toHaveBeenCalledOnce();
    expect(deps.pause).toHaveBeenCalledWith(750);
  });

  it("keeps a failed user's references pending and continues with later users", async () => {
    const failure = new Error("permesso negato");
    const deleteCalendar = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);
    const deps = dependencies({ deleteCalendar });

    const result = await retireLegacyCalendars(users.slice(0, 2), deps);

    expect(result).toEqual({
      calendarsRemoved: ["seconda@rainerum.it"],
      calendarsPending: ["prima@rainerum.it"],
      errors: ["calendario prima@rainerum.it: permesso negato"],
    });
    expect(deps.finalizeUser).toHaveBeenCalledOnce();
    expect(deps.finalizeUser).toHaveBeenCalledWith("user-2");
  });

  it.each([
    ["429", Object.assign(new Error("too many requests"), { code: 429 })],
    [
      "403 quotaExceeded",
      gaxios403("quotaExceeded"),
    ],
    [
      "403 rateLimitExceeded",
      gaxios403("rateLimitExceeded"),
    ],
    [
      "403 userRateLimitExceeded",
      gaxios403("userRateLimitExceeded"),
    ],
  ])("stops on exhausted Google %s and leaves untouched users pending", async (label, usageLimit) => {
    let attempts = 0;
    const deleteCalendar = vi.fn(() =>
      withRetry(
        async () => {
          attempts++;
          throw usageLimit;
        },
        { retries: 2, sleep: async () => undefined }
      )
    );
    const deps = dependencies({ deleteCalendar, isUsageLimit: isCalendarUsageLimitError });

    const result = await retireLegacyCalendars(users, deps);

    expect(result).toEqual({
      calendarsRemoved: [],
      calendarsPending: ["prima@rainerum.it", "seconda@rainerum.it", "terza@rainerum.it"],
      errors: [expect.stringContaining("limite operativo")],
    });
    expect(deps.finalizeUser).not.toHaveBeenCalled();
    expect(deleteCalendar).toHaveBeenCalledOnce();
    expect(deleteCalendar).not.toHaveBeenCalledWith("calendar-2");
    expect(attempts).toBe(label === "403 quotaExceeded" ? 1 : 3);
  });

  it("retries a pending calendar on a later call", async () => {
    const deleteCalendar = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporaneo"))
      .mockResolvedValueOnce(undefined);
    const deps = dependencies({ deleteCalendar });

    const first = await retireLegacyCalendars([users[0]], deps);
    const second = await retireLegacyCalendars([users[0]], deps);

    expect(first.calendarsPending).toEqual(["prima@rainerum.it"]);
    expect(second.calendarsRemoved).toEqual(["prima@rainerum.it"]);
    expect(deps.finalizeUser).toHaveBeenCalledOnce();
    expect(deps.finalizeUser).toHaveBeenCalledWith("user-1");
  });
});

describe("full synchronization retirement wiring", () => {
  it("selects every non-null legacy calendar and finalizes it transactionally after deletion", async () => {
    const deleteOperation = { operation: "delete-instances" };
    const updateOperation = { operation: "clear-calendar-reference" };
    db.userFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "inactive-user",
          email: "servizio@rainerum.it",
          calendarId: "legacy-calendar",
          isActive: false,
        },
      ]);
    db.eventInstanceDeleteMany.mockReturnValue(deleteOperation);
    db.userUpdate.mockReturnValue(updateOperation);

    const result = await runFullSync();

    expect(db.userFindMany).toHaveBeenNthCalledWith(2, {
      where: { calendarId: { not: null } },
      select: { id: true, email: true, calendarId: true },
    });
    expect(google.deleteCalendar).toHaveBeenCalledWith("legacy-calendar");
    expect(google.deleteCalendar.mock.invocationCallOrder[0]).toBeLessThan(
      db.eventInstanceDeleteMany.mock.invocationCallOrder[0]
    );
    expect(db.eventInstanceDeleteMany).toHaveBeenCalledWith({
      where: { userId: "inactive-user" },
    });
    expect(db.userUpdate).toHaveBeenCalledWith({
      where: { id: "inactive-user" },
      data: { calendarId: null, calendarName: null },
    });
    expect(db.transaction).toHaveBeenCalledWith([deleteOperation, updateOperation]);
    expect(result.calendarsRemoved).toEqual(["servizio@rainerum.it"]);
  });

  it("does not clear database references when whole-calendar deletion fails", async () => {
    db.userFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "pending-user",
          email: "pending@rainerum.it",
          calendarId: "pending-calendar",
          isActive: false,
        },
      ]);
    google.deleteCalendar.mockRejectedValue(new Error("forbidden"));

    const result = await runFullSync();

    expect(db.eventInstanceDeleteMany).not.toHaveBeenCalled();
    expect(db.userUpdate).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(result.calendarsPending).toEqual(["pending@rainerum.it"]);
  });

  it("stops after an exhausted Gaxios rate limit without later deletion or local cleanup", async () => {
    db.userFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "limited-user",
          email: "limited@rainerum.it",
          calendarId: "limited-calendar",
        },
        {
          id: "untouched-user",
          email: "untouched@rainerum.it",
          calendarId: "untouched-calendar",
        },
      ]);
    google.deleteCalendar.mockRejectedValue(gaxios403("rateLimitExceeded"));

    const result = await runFullSync();

    expect(google.deleteCalendar).toHaveBeenCalledOnce();
    expect(google.deleteCalendar).not.toHaveBeenCalledWith("untouched-calendar");
    expect(db.eventInstanceDeleteMany).not.toHaveBeenCalled();
    expect(db.userUpdate).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(result.calendarsPending).toEqual([
      "limited@rainerum.it",
      "untouched@rainerum.it",
    ]);
  });
});
