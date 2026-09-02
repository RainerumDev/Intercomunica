import { describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({ prisma: {} }));
vi.mock("../auth/session.js", () => ({ requireAdmin: vi.fn(), requireAuth: vi.fn() }));

describe("event calendar capabilities", () => {
  it("reports a configured reader calendar as read-only", async () => {
    const { calendarCapabilities } = await import("./events.js");

    expect(
      calendarCapabilities({
        generalCalendarId: "general-calendar",
        generalCalendarAccessRole: "reader",
      })
    ).toEqual({ generalCalendarConfigured: true, generalCalendarWritable: false });
  });

  it("reports writer and owner calendars as writable", async () => {
    const { calendarCapabilities } = await import("./events.js");

    expect(
      calendarCapabilities({
        generalCalendarId: "general-calendar",
        generalCalendarAccessRole: "writer",
      }).generalCalendarWritable
    ).toBe(true);
    expect(
      calendarCapabilities({
        generalCalendarId: "general-calendar",
        generalCalendarAccessRole: "owner",
      }).generalCalendarWritable
    ).toBe(true);
  });

  it("serializes whether an event already exists on the general calendar", async () => {
    const { serializeEvent } = await import("./events.js");
    const serialized = serializeEvent({
      id: "event-1",
      title: "Collegio",
      description: null,
      location: null,
      startsAt: new Date("2026-09-02T09:00:00.000Z"),
      endsAt: new Date("2026-09-02T10:00:00.000Z"),
      allDay: false,
      isGlobal: true,
      bachecaOnly: false,
      generalGoogleEventId: "google-event-1",
      tags: [],
      subgroups: [],
    });

    expect(serialized.hasGeneralCalendarEvent).toBe(true);
  });
});
