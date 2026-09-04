import { describe, expect, it } from "vitest";
import {
  flattenBachecaEvents,
  partitionBachecaEvents,
} from "./bacheca";
import type { BachecaEvent, BachecaSection } from "./types";

function event(overrides: Partial<BachecaEvent> = {}): BachecaEvent {
  return {
    id: "event-1",
    title: "Riunione",
    description: null,
    location: null,
    startsAt: "2026-09-04T08:00:00+02:00",
    endsAt: "2026-09-04T09:00:00+02:00",
    allDay: false,
    isGlobal: false,
    tags: [],
    ...overrides,
  };
}

describe("flattenBachecaEvents", () => {
  it("deduplicates multi-tag events, merges their categories, and orders events chronologically", () => {
    const shared = event({
      id: "shared-multi-tag",
      startsAt: "2026-09-04T08:00:00+02:00",
      tags: ["Collegi"],
    });
    const later = event({
      id: "later-event",
      startsAt: "2026-09-05T08:00:00+02:00",
      tags: [],
    });
    const sameTimeLaterId = event({
      id: "z-last",
      startsAt: "2026-09-05T08:00:00+02:00",
      tags: ["Riunioni"],
    });
    const collegi: BachecaSection = {
      tag: "Collegi",
      color: "#b91c1c",
      events: [shared, later],
    };
    const riunioni: BachecaSection = {
      tag: "Riunioni",
      color: "#1d4ed8",
      events: [{ ...shared, tags: ["Collegi", "Riunioni"] }, sameTimeLaterId],
    };

    const result = flattenBachecaEvents([collegi, riunioni]);

    expect(result.map(({ id }) => id)).toEqual([
      "shared-multi-tag",
      "later-event",
      "z-last",
    ]);
    expect(result[0]?.tags).toEqual(["Collegi", "Riunioni"]);
    expect(result[1]?.tags).toEqual(["Collegi"]);
  });
});

describe("partitionBachecaEvents", () => {
  it("keeps a multi-day event already in progress in today", () => {
    const runningToday = event({
      id: "running-today",
      startsAt: "2026-09-03T14:00:00+02:00",
      endsAt: "2026-09-04T18:00:00+02:00",
    });

    expect(
      partitionBachecaEvents([runningToday], new Date("2026-09-04T10:00:00+02:00")).today,
    ).toContainEqual(expect.objectContaining({ id: "running-today" }));
  });

  it("uses Europe/Rome midnight to separate today from upcoming events", () => {
    const today = event({
      id: "late-today",
      startsAt: "2026-09-04T23:59:00+02:00",
      endsAt: "2026-09-05T00:30:00+02:00",
    });
    const tomorrow = event({
      id: "rome-midnight",
      startsAt: "2026-09-05T00:00:00+02:00",
      endsAt: "2026-09-05T01:00:00+02:00",
    });

    const result = partitionBachecaEvents(
      [today, tomorrow],
      new Date("2026-09-04T10:00:00+02:00"),
    );

    expect(result.today.map(({ id }) => id)).toEqual(["late-today"]);
    expect(result.upcoming.map(({ id }) => id)).toEqual(["rome-midnight"]);
  });
});
