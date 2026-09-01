import { afterEach, describe, expect, it, vi } from "vitest";

describe("calendarExcludedEmails", () => {
  const originalValue = process.env.CALENDAR_EXCLUDED_EMAILS;

  afterEach(() => {
    if (originalValue === undefined) delete process.env.CALENDAR_EXCLUDED_EMAILS;
    else process.env.CALENDAR_EXCLUDED_EMAILS = originalValue;
    vi.resetModules();
  });

  it("normalizes whitespace, case, and duplicate addresses from the environment", async () => {
    process.env.CALENDAR_EXCLUDED_EMAILS =
      " Segreteria@Rainerum.it, portineria@rainerum.it, segreteria@rainerum.it, ";
    vi.resetModules();

    const configModule = await import("./config.js");
    const calendarExcludedEmails = (
      configModule as typeof configModule & { calendarExcludedEmails: () => Set<string> }
    ).calendarExcludedEmails;

    expect([...calendarExcludedEmails()]).toEqual([
      "segreteria@rainerum.it",
      "portineria@rainerum.it",
    ]);
  });

  it("disables personal calendars only for configured addresses", async () => {
    process.env.CALENDAR_EXCLUDED_EMAILS = "segreteria@rainerum.it,portineria@rainerum.it";
    vi.resetModules();

    const configModule = await import("./config.js");
    const usesPersonalCalendar = (
      configModule as typeof configModule & { usesPersonalCalendar: (email: string) => boolean }
    ).usesPersonalCalendar;

    expect(usesPersonalCalendar("SEGRETERIA@RAINERUM.IT")).toBe(false);
    expect(usesPersonalCalendar("docente@rainerum.it")).toBe(true);
  });

  it("bypasses group access for admins and calendar-excluded accounts", async () => {
    process.env.ADMIN_EMAILS = "Presidenza@Rainerum.it";
    process.env.CALENDAR_EXCLUDED_EMAILS = "segreteria@rainerum.it";
    vi.resetModules();

    const configModule = await import("./config.js");
    const isAccessBypassEmail = (
      configModule as typeof configModule & { isAccessBypassEmail: (email: string) => boolean }
    ).isAccessBypassEmail;

    expect(isAccessBypassEmail("presidenza@rainerum.it")).toBe(true);
    expect(isAccessBypassEmail("SEGRETERIA@RAINERUM.IT")).toBe(true);
    expect(isAccessBypassEmail("docente@rainerum.it")).toBe(false);
  });
});
