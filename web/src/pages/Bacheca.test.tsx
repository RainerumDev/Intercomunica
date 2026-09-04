// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import type { BachecaPayload } from "../types";
import Bacheca from "./Bacheca";

vi.mock("../auth", () => ({
  useAuth: () => ({ me: { name: "Anna Rossi" } }),
}));

const payloadWithEvents: BachecaPayload = {
  eventSections: [
    {
      tag: "Collegi",
      color: "#b91c1c",
      events: [
        {
          id: "event-1",
          title: "Collegio docenti",
          description: "Ordine del giorno disponibile.",
          location: "Aula magna",
          startsAt: "2026-09-10T14:30:00.000Z",
          endsAt: "2026-09-10T16:30:00.000Z",
          allDay: false,
          isGlobal: true,
          tags: ["Collegi"],
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Bacheca", () => {
  it("requests and renders only the event payload", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(payloadWithEvents);
    render(<Bacheca />);

    expect(await screen.findByRole("heading", { name: "Collegio docenti" })).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/bacheca");
    expect(get).not.toHaveBeenCalledWith("/api/calendar-links");
    expect(get).not.toHaveBeenCalledWith("/api/resources");
    expect(screen.queryByRole("heading", { name: "Calendari" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Risorse condivise" })).toBeNull();
  });

  it("shows event errors without resource or calendar requests", async () => {
    const get = vi.spyOn(api, "get").mockRejectedValue(new Error("Bacheca non disponibile"));
    render(<Bacheca />);

    expect((await screen.findByRole("alert")).textContent).toContain("Bacheca non disponibile");
    expect(get).toHaveBeenCalledWith("/api/bacheca");
    expect(get).not.toHaveBeenCalledWith("/api/calendar-links");
    expect(get).not.toHaveBeenCalledWith("/api/resources");
  });
});
