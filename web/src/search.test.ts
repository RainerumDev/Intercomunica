import { describe, expect, it } from "vitest";
import { filterBachecaEvents } from "./bacheca";
import { normalizeSearchText } from "./search";
import type { BachecaEvent } from "./types";

const events: BachecaEvent[] = [
  {
    id: "collegio",
    title: "Riunióne di dipartimento",
    description: "Ordine del giorno disponibile.",
    location: "Aula Màgna",
    startsAt: "2026-09-10T14:30:00+02:00",
    endsAt: "2026-09-10T16:30:00+02:00",
    allDay: false,
    isGlobal: true,
    tags: ["Collegi"],
  },
  {
    id: "other",
    title: "Riunione organizzativa",
    description: null,
    location: "Laboratorio",
    startsAt: "2026-09-11T14:30:00+02:00",
    endsAt: "2026-09-11T16:30:00+02:00",
    allDay: false,
    isGlobal: false,
    tags: ["Riunioni"],
  },
];

describe("normalizeSearchText", () => {
  it("removes accents, lowercases, and trims text", () => {
    expect(normalizeSearchText("  RÍUNIÓNÈ  ")).toBe("riunione");
  });
});

describe("filterBachecaEvents", () => {
  it("combines accent-insensitive word matching with the selected category", () => {
    expect(filterBachecaEvents(events, "riunione aula magna", "Collegi"))
      .toEqual([events[0]]);
  });

  it("matches a selected category exactly rather than by prefix or superstring", () => {
    const similarlyNamed = [
      ...events,
      { ...events[0], id: "collegiali", tags: ["Collegiali"] },
      { ...events[0], id: "college", tags: ["College"] },
    ];

    expect(filterBachecaEvents(similarlyNamed, "", "Collegi").map(({ id }) => id))
      .toEqual(["collegio"]);
  });
});
