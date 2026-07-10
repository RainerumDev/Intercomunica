import { describe, it, expect } from "vitest";
import type { CalendarEventPayload } from "./calendar.js";

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
});
