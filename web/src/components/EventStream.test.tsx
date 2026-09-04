// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { BachecaEvent, BachecaSection } from "../types";
import { EventStream } from "./EventStream";

const now = new Date("2026-09-04T09:00:00+02:00");

function event(index: number, overrides: Partial<BachecaEvent> = {}): BachecaEvent {
  return {
    id: `event-${index}`,
    title: `Evento numero ${index}`,
    description: null,
    location: "Aula magna",
    startsAt: `2026-09-${String(4 + index).padStart(2, "0")}T10:00:00+02:00`,
    endsAt: `2026-09-${String(4 + index).padStart(2, "0")}T11:00:00+02:00`,
    allDay: false,
    isGlobal: false,
    tags: ["Riunioni"],
    ...overrides,
  };
}

const todayFirst = event(0, {
  id: "today-first",
  title: "Primo evento di oggi",
  startsAt: "2026-09-04T08:00:00+02:00",
  endsAt: "2026-09-04T09:30:00+02:00",
  tags: ["Collegi"],
});
const todaySecond = event(0, {
  id: "today-second",
  title: "Secondo evento di oggi",
  startsAt: "2026-09-04T15:00:00+02:00",
  endsAt: "2026-09-04T16:00:00+02:00",
  tags: ["Riunioni"],
});
const multiTag = event(1, { id: "multi-tag", title: "Riunione multi-tag", tags: ["Collegi", "Riunioni"] });
const distant = event(20, {
  id: "distant",
  title: "Evento distante di dicembre",
  description: "Riunione in biblioteca",
  startsAt: "2026-12-20T10:00:00+01:00",
  endsAt: "2026-12-20T11:00:00+01:00",
  tags: ["Riunioni"],
});

const sections: BachecaSection[] = [
  {
    tag: "Collegi",
    color: "#b91c1c",
    events: [todayFirst, multiTag],
  },
  {
    tag: "Riunioni",
    color: "#1d4ed8",
    events: [todaySecond, multiTag, ...Array.from({ length: 7 }, (_, index) => event(index + 2)), distant],
  },
];

afterEach(cleanup);

describe("EventStream", () => {
  it("shows every event today and only the first six upcoming events without duplicates", () => {
    render(<EventStream sections={sections} now={now} />);

    expect(screen.getByRole("heading", { name: "Oggi" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prossimi eventi" })).toBeTruthy();
    expect(screen.getAllByTestId("event-row")).toHaveLength(8);
    expect(screen.getAllByRole("heading", { name: "Riunione multi-tag" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Evento numero 7" })).toBeNull();
  });

  it("expands by six and searches the complete future collection", async () => {
    const user = userEvent.setup();
    render(<EventStream sections={sections} now={now} />);

    await user.click(screen.getByRole("button", { name: "Mostra altri eventi" }));
    expect(screen.getByRole("heading", { name: "Evento numero 7" })).toBeTruthy();

    await user.type(screen.getByRole("searchbox", { name: "Cerca negli eventi" }), "dicembre");
    expect(screen.getByRole("heading", { name: "Evento distante di dicembre" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mostra altri eventi" })).toBeNull();
  });

  it("combines category and text filters and resets the upcoming limit when either changes", async () => {
    const user = userEvent.setup();
    render(<EventStream sections={sections} now={now} />);

    await user.click(screen.getByRole("button", { name: "Mostra altri eventi" }));
    await user.click(screen.getByRole("button", { name: "Collegi" }));
    expect(screen.queryByRole("heading", { name: "Evento numero 7" })).toBeNull();

    await user.type(screen.getByRole("searchbox", { name: "Cerca negli eventi" }), "riunione");
    expect(screen.getByRole("heading", { name: "Riunione multi-tag" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Evento distante di dicembre" })).toBeNull();
  });
});
