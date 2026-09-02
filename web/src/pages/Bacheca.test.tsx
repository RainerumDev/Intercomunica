// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import type { BachecaPayload, CalendarLinks, SharedResource } from "../types";
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

const calendarLinks: CalendarLinks = {
  generalGoogleUrl: "https://calendar.google.com/calendar/embed?src=shared%40example.org",
  personalIcsUrl: "https://intercomunica.example.org/calendar/feed/personal-token.ics",
  personalWebcalUrl: "webcal://intercomunica.example.org/calendar/feed/personal-token.ics",
  personalFeedEligible: true,
  lastFetchedAt: null,
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
  vi.spyOn(api, "get").mockImplementation(((path: string) => {
    if (path === "/api/bacheca") return Promise.resolve(payload);
    if (path === "/api/calendar-links") return Promise.resolve(calendarLinks);
    throw new Error(`Unexpected GET ${path}`);
  }) as typeof api.get);
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
  it("renders calendar subscriptions alongside the shared-resource payload", async () => {
    renderWithPayload(payloadWithEvents);

    expect(await screen.findByRole("heading", { name: "Calendari" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Collega calendario generale" }).getAttribute("href"))
      .toBe(calendarLinks.generalGoogleUrl);
    expect(screen.getByRole("button", { name: "Collega il mio calendario" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Risorse condivise" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prossimi eventi" })).toBeTruthy();
  });

  it("keeps shared resources and events visible when calendar links fail", async () => {
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/bacheca") return Promise.resolve(payloadWithEvents);
      if (path === "/api/calendar-links") return Promise.reject(new Error("collegamenti non disponibili"));
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);

    render(<Bacheca />);

    expect(await screen.findByRole("heading", { name: "Guida condivisa" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Collegio docenti" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("collegamenti non disponibili");
  });

  it("keeps successful calendar resources visible when the Bacheca aggregate fails", async () => {
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/bacheca") return Promise.reject(new Error("contenuti non disponibili"));
      if (path === "/api/calendar-links") return Promise.resolve(calendarLinks);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);

    render(<Bacheca />);

    const generalCalendar = await screen.findByRole("link", { name: "Collega calendario generale" });
    expect(generalCalendar.getAttribute("href")).toBe(calendarLinks.generalGoogleUrl);
    expect(screen.getByRole("button", { name: "Collega il mio calendario" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("contenuti non disponibili");
    expect(screen.queryByRole("heading", { name: "Risorse condivise" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Prossimi eventi" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Guida condivisa" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Collegio docenti" })).toBeNull();
  });

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

    const loading = screen.getByText("Caricamento bacheca…");
    expect(loading.getAttribute("role")).toBe("status");
    expect(loading.getAttribute("aria-live")).toBe("polite");
    reject(new Error("Bacheca non disponibile"));
    expect((await screen.findByRole("alert")).textContent).toContain("Bacheca non disponibile");
  });
});
