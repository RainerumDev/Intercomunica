import { describe, expect, it, vi } from "vitest";
import type { LegacyCalendarUser, RetirementDependencies } from "./syncService.js";
import { retireLegacyCalendars } from "./syncService.js";

vi.mock("../db.js", () => ({ prisma: {} }));

const users: LegacyCalendarUser[] = [
  { id: "user-1", email: "prima@rainerum.it", calendarId: "calendar-1" },
  { id: "user-2", email: "seconda@rainerum.it", calendarId: "calendar-2" },
  { id: "user-3", email: "terza@rainerum.it", calendarId: "calendar-3" },
];

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

  it("stops on an operational usage limit and leaves the current and untouched users pending", async () => {
    const usageLimit = new Error("quota");
    const deleteCalendar = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(usageLimit);
    const deps = dependencies({
      deleteCalendar,
      isUsageLimit: vi.fn((error) => error === usageLimit),
    });

    const result = await retireLegacyCalendars(users, deps);

    expect(result).toEqual({
      calendarsRemoved: ["prima@rainerum.it"],
      calendarsPending: ["seconda@rainerum.it", "terza@rainerum.it"],
      errors: [expect.stringContaining("limite operativo")],
    });
    expect(deps.finalizeUser).toHaveBeenCalledWith("user-1");
    expect(deps.finalizeUser).not.toHaveBeenCalledWith("user-2");
    expect(deleteCalendar).not.toHaveBeenCalledWith("calendar-3");
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
