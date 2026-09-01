// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import type { BachecaPayload, SharedResource } from "../types";
import Bacheca from "./Bacheca";

vi.mock("../auth", () => ({
  useAuth: () => ({ me: { name: "Anna Rossi" } }),
}));

const resource: SharedResource = {
  id: "resource-1",
  url: "https://risorse.example.org/guida",
  title: "Guida condivisa",
  description: "Materiale utile per il collegio docenti.",
  previewEnabled: false,
  previewImageUrl: null,
  previewSiteName: "Risorse Rainerum",
  previewFetchedAt: null,
  isGlobal: true,
  sortOrder: 0,
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
  subgroupIds: [],
};

const payloadWithEvents: BachecaPayload = {
  resources: [resource],
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
    {
      tag: "Riunioni",
      color: "#1d4ed8",
      events: [
        {
          id: "event-2",
          title: "Riunione di dipartimento",
          description: null,
          location: null,
          startsAt: "2026-09-11T14:30:00.000Z",
          endsAt: "2026-09-11T16:30:00.000Z",
          allDay: false,
          isGlobal: false,
          tags: ["Riunioni"],
        },
      ],
    },
  ],
};

function renderWithPayload(payload: BachecaPayload) {
  vi.spyOn(api, "get").mockResolvedValue(payload);
  return render(<Bacheca />);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Bacheca", () => {
  it("renders shared resources before the unchanged event sections and uses a safe external card link", async () => {
    const { container } = renderWithPayload(payloadWithEvents);

    const resourceHeading = await screen.findByRole("heading", { name: "Risorse condivise" });
    const eventsHeading = screen.getByRole("heading", { name: "Prossimi eventi" });
    expect(resourceHeading.compareDocumentPosition(eventsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const collegiHeading = screen.getByRole("heading", { name: "Collegi", level: 3 });
    const riunioniHeading = screen.getByRole("heading", { name: "Riunioni", level: 3 });
    expect(collegiHeading.compareDocumentPosition(riunioniHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Collegio docenti" })).toBeTruthy();
    expect(screen.getByText("Le risorse condivise e i tuoi prossimi impegni, organizzati per categoria.")).toBeTruthy();

    const card = screen.getByRole("article");
    const link = within(card).getByRole("link", { name: /guida condivisa/i });
    expect(link.getAttribute("href")).toBe("https://risorse.example.org/guida");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.textContent).toContain("Aula magna");
  });

  it("shows the event empty state without hiding available resources", async () => {
    renderWithPayload({ resources: [resource], eventSections: [] });

    expect(await screen.findByRole("heading", { name: "Guida condivisa" })).toBeTruthy();
    expect(screen.getByText("Nessun impegno in programma. Goditi la calma! 🌿")).toBeTruthy();
    expect(screen.queryByText("Nessuna risorsa condivisa disponibile.")).toBeNull();
  });

  it("shows the resource empty state without hiding available events", async () => {
    renderWithPayload({ resources: [], eventSections: payloadWithEvents.eventSections });

    expect(await screen.findByText("Nessuna risorsa condivisa disponibile.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Collegio docenti" })).toBeTruthy();
    expect(screen.queryByText("Nessun impegno in programma. Goditi la calma! 🌿")).toBeNull();
  });

  it("keeps both collection empty states visible when the payload is empty", async () => {
    renderWithPayload({ resources: [], eventSections: [] });

    expect(await screen.findByText("Nessuna risorsa condivisa disponibile.")).toBeTruthy();
    expect(screen.getByText("Nessun impegno in programma. Goditi la calma! 🌿")).toBeTruthy();
  });

  it("shows a loading state before the payload resolves and surfaces request errors", async () => {
    let reject!: (error: Error) => void;
    vi.spyOn(api, "get").mockReturnValue(
      new Promise<BachecaPayload>((_resolve, rejectPromise) => {
        reject = rejectPromise;
      }),
    );
    render(<Bacheca />);

    expect(screen.getByRole("status").textContent).toContain("Caricamento bacheca…");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    reject(new Error("Bacheca non disponibile"));
    expect((await screen.findByRole("alert")).textContent).toContain("Bacheca non disponibile");
  });
});
