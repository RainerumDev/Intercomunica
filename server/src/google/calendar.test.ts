import { beforeEach, describe, it, expect, vi } from "vitest";
import type { CalendarEventPayload } from "./calendar.js";
import type { calendar_v3 } from "googleapis";

const google = vi.hoisted(() => ({
  deleteCalendar: vi.fn(),
}));

vi.mock("./master.js", () => ({
  calendarApi: vi.fn(async () => ({
    calendars: { delete: google.deleteCalendar },
  })),
}));

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
  google.deleteCalendar.mockReset();
});

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

  it.each([404, 410])("treats an already absent calendar (%s) as deleted", async (code) => {
    google.deleteCalendar.mockRejectedValue(Object.assign(new Error("gone"), { code }));
    const { deleteCalendar } = await import("./calendar.js");

    await expect(deleteCalendar("legacy@rainerum.it")).resolves.toBeUndefined();
  });

  it("preserves unexpected Google deletion failures", async () => {
    const failure = Object.assign(new Error("forbidden"), { code: 403 });
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
