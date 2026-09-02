import { beforeEach, describe, it, expect, vi } from "vitest";
import type { CalendarEventPayload } from "./calendar.js";
import type { calendar_v3 } from "googleapis";

const google = vi.hoisted(() => ({
  deleteCalendar: vi.fn(),
  listEvents: vi.fn(),
}));

vi.mock("./master.js", () => ({
  calendarApi: vi.fn(async () => ({
    calendars: { delete: google.deleteCalendar },
    events: { list: google.listEvents },
  })),
}));

vi.mock("../db.js", () => ({ prisma: {} }));
vi.mock("./directory.js", () => ({ listGroupMembers: vi.fn() }));

const base: CalendarEventPayload = {
  title: "Collegio Docenti",
  description: "Ordine del giorno in allegato",
  location: "Aula Magna",
  startsAt: new Date("2026-09-01T14:00:00.000Z"),
  endsAt: new Date("2026-09-01T16:00:00.000Z"),
  allDay: false,
  appEventId: "evt_123",
  subgroupIds: ["sg_a", "sg_b"],
  tagNames: ["RIUNIONI"],
};

beforeEach(() => {
  for (const mock of Object.values(google)) mock.mockReset();
});

describe("listCalendarChanges", () => {
  it("returns the calendar name and access role already supplied by events.list", async () => {
    google.listEvents.mockResolvedValue({
      data: {
        items: [],
        nextSyncToken: "sync-2",
        summary: "Calendario generale Rainerum",
        accessRole: "reader",
      },
    });
    const { listCalendarChanges } = await import("./calendar.js");

    await expect(
      listCalendarChanges("general-calendar", { syncToken: "sync-1" })
    ).resolves.toEqual({
      items: [],
      nextSyncToken: "sync-2",
      calendarName: "Calendario generale Rainerum",
      accessRole: "reader",
    });
  });
});

function gaxiosError(status: number) {
  return Object.assign(new Error("gone"), {
    status,
    response: {
      status,
      data: { error: { code: status, message: "gone", errors: [] } },
    },
  });
}

describe("deleteCalendar", () => {
  it("deletes the whole legacy calendar", async () => {
    google.deleteCalendar.mockResolvedValue({ data: {} });
    const { deleteCalendar } = await import("./calendar.js");

    await deleteCalendar("legacy@rainerum.it");

    expect(google.deleteCalendar).toHaveBeenCalledOnce();
    expect(google.deleteCalendar).toHaveBeenCalledWith({
      calendarId: "legacy@rainerum.it",
    });
  });

  it.each([404, 410])("treats a Gaxios %s as deleted and finalizes local state", async (status) => {
    google.deleteCalendar.mockRejectedValue(gaxiosError(status));
    const { deleteCalendar } = await import("./calendar.js");
    const { retireLegacyCalendars } = await import("../services/syncService.js");
    const finalizeUser = vi.fn().mockResolvedValue(undefined);

    const result = await retireLegacyCalendars(
      [{ id: "user-1", email: "legacy@rainerum.it", calendarId: "legacy-calendar" }],
      {
        deleteCalendar,
        finalizeUser,
        pause: vi.fn().mockResolvedValue(undefined),
        isUsageLimit: vi.fn().mockReturnValue(false),
      }
    );

    expect(result).toEqual({
      calendarsRemoved: ["legacy@rainerum.it"],
      calendarsPending: [],
      errors: [],
    });
    expect(finalizeUser).toHaveBeenCalledWith("user-1");
  });

  it("preserves unexpected Google deletion failures", async () => {
    const failure = gaxiosError(403);
    google.deleteCalendar.mockRejectedValue(failure);
    const { deleteCalendar } = await import("./calendar.js");

    await expect(deleteCalendar("legacy@rainerum.it")).rejects.toBe(failure);
  });
});

describe("toGoogleEvent (Flusso 3.3 — campi nativi + extendedProperties)", () => {
  it("maps native fields and private extendedProperties", async () => {
    const { toGoogleEvent } = await import("./calendar.js");
    const g = toGoogleEvent(base);
    expect(g.summary).toBe("Collegio Docenti");
    expect(g.description).toBe("Ordine del giorno in allegato");
    expect(g.location).toBe("Aula Magna");
    expect(g.start).toEqual({ dateTime: "2026-09-01T14:00:00.000Z" });
    expect(g.end).toEqual({ dateTime: "2026-09-01T16:00:00.000Z" });
    expect(g.extendedProperties.private).toEqual({
      intercomunica: "true",
      intercomunicaEventId: "evt_123",
      subgroupIds: "sg_a,sg_b",
      tags: "RIUNIONI",
    });
  });

  it("uses all-day date format when allDay=true", async () => {
    const { toGoogleEvent } = await import("./calendar.js");
    const g = toGoogleEvent({ ...base, allDay: true });
    expect(g.start).toEqual({ date: "2026-09-01" });
    expect(g.end).toEqual({ date: "2026-09-01" });
  });

  it("omits optional fields when null", async () => {
    const { toGoogleEvent } = await import("./calendar.js");
    const g = toGoogleEvent({ ...base, description: null, location: null });
    expect(g.description).toBeUndefined();
    expect(g.location).toBeUndefined();
  });

  it("converts an expanded Google occurrence into an editable app event", async () => {
    const { fromGoogleEvent } = await import("./calendar.js");
    const source: calendar_v3.Schema$Event = {
      id: "instance-1",
      recurringEventId: "series-1",
      originalStartTime: { dateTime: "2026-09-03T08:00:00+02:00" },
      summary: "Collegio",
      description: "Ordine del giorno",
      location: "Aula magna",
      start: { dateTime: "2026-09-03T08:00:00+02:00" },
      end: { dateTime: "2026-09-03T10:00:00+02:00" },
    };

    expect(fromGoogleEvent(source)).toEqual({
      googleEventId: "instance-1",
      occurrenceKey: "series-1:2026-09-03T08:00:00+02:00",
      title: "Collegio",
      description: "Ordine del giorno",
      location: "Aula magna",
      startsAt: new Date("2026-09-03T06:00:00.000Z"),
      endsAt: new Date("2026-09-03T08:00:00.000Z"),
      allDay: false,
      appEventId: undefined,
      tagNames: [],
    });
  });

  it("preserves Google's exclusive end date for all-day events", async () => {
    const { fromGoogleEvent } = await import("./calendar.js");
    const source: calendar_v3.Schema$Event = {
      id: "day-1",
      summary: "Festa",
      start: { date: "2026-09-03" },
      end: { date: "2026-09-04" },
    };

    const converted = fromGoogleEvent(source);
    expect(converted?.allDay).toBe(true);
    expect(converted?.startsAt.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(converted?.endsAt.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("ignores cancelled events during conversion", async () => {
    const { fromGoogleEvent } = await import("./calendar.js");
    expect(fromGoogleEvent({ id: "gone", status: "cancelled" })).toBeNull();
  });
});
