// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import type { CalendarLinks, SharedResource } from "../types";
import Risorse from "./Risorse";

const calendarLinks: CalendarLinks = {
  generalGoogleUrl: "https://calendar.google.com/calendar/embed?src=shared%40example.org",
  personalIcsUrl: "https://intercomunica.example.org/calendar/feed/personal-token.ics",
  personalWebcalUrl: "webcal://intercomunica.example.org/calendar/feed/personal-token.ics",
  personalFeedEligible: true,
  lastFetchedAt: null,
};

const resources: SharedResource[] = [
  {
    id: "vademecum",
    url: "https://docs.example.org/vademecum",
    title: "Vademecum",
    description: "Guida introduttiva.",
    previewEnabled: false,
    previewImageUrl: null,
    hasPreviewImage: false,
    previewSiteName: "Documenti Rainerum",
    previewFetchedAt: null,
    isGlobal: true,
    sortOrder: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    subgroupIds: [],
  },
  {
    id: "registro",
    url: "https://registro.example.org/accesso",
    title: "Registro elettronico",
    description: null,
    previewEnabled: false,
    previewImageUrl: null,
    hasPreviewImage: false,
    previewSiteName: "Portale studenti",
    previewFetchedAt: null,
    isGlobal: true,
    sortOrder: 2,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    subgroupIds: [],
  },
  {
    id: "circolari",
    url: "https://circolari.example.org/archivio",
    title: "Circolari",
    description: null,
    previewEnabled: false,
    previewImageUrl: null,
    hasPreviewImage: false,
    previewSiteName: "Archivio scolastico",
    previewFetchedAt: null,
    isGlobal: true,
    sortOrder: 3,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    subgroupIds: [],
  },
];

function mockSuccessfulRequests() {
  return vi.spyOn(api, "get").mockImplementation(((path: string) => {
    if (path === "/api/resources") return Promise.resolve(resources);
    if (path === "/api/calendar-links") return Promise.resolve(calendarLinks);
    throw new Error(`Unexpected GET ${path}`);
  }) as typeof api.get);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Risorse", () => {
  it("loads calendar links and resources, then filters text without changing administrative order", async () => {
    const user = userEvent.setup();
    const get = mockSuccessfulRequests();
    render(<Risorse />);

    expect(await screen.findByRole("heading", { name: "Vademecum" })).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/resources");
    expect(get).toHaveBeenCalledWith("/api/calendar-links");
    expect(screen.getAllByRole("article").map((card) =>
      within(card).getByRole("heading", { level: 3 }).textContent,
    )).toEqual(["Vademecum", "Registro elettronico", "Circolari"]);

    const search = screen.getByRole("searchbox", { name: "Cerca nelle risorse" });
    const calendars = screen.getByRole("heading", { name: "Calendari" });
    const firstResource = screen.getByRole("heading", { name: "Vademecum" });
    expect(search.compareDocumentPosition(calendars) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(calendars.compareDocumentPosition(firstResource) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(search, "registro");
    expect(screen.getByRole("heading", { name: "Registro elettronico" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Vademecum" })).toBeNull();

    await user.clear(search);
    await user.type(search, "archivio scolastico");
    expect(screen.getByRole("heading", { name: "Circolari" })).toBeTruthy();

    await user.clear(search);
    await user.type(search, "circolari.example.org");
    expect(screen.getByRole("heading", { name: "Circolari" })).toBeTruthy();
  });

  it("keeps calendar links visible when the resources request fails", async () => {
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/resources") return Promise.reject(new Error("risorse non disponibili"));
      if (path === "/api/calendar-links") return Promise.resolve(calendarLinks);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);
    render(<Risorse />);

    expect(await screen.findByRole("link", { name: "Collega calendario generale" })).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("risorse non disponibili");
    expect(screen.queryByRole("heading", { name: "Vademecum" })).toBeNull();
  });

  it("keeps resources visible when the calendar links request fails", async () => {
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/resources") return Promise.resolve(resources);
      if (path === "/api/calendar-links") return Promise.reject(new Error("calendari non disponibili"));
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);
    render(<Risorse />);

    expect(await screen.findByRole("heading", { name: "Vademecum" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("calendari non disponibili");
  });
});
