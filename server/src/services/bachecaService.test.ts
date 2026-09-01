import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { SectionInputEvent } from "./bachecaService.js";

const bachecaRepository = vi.hoisted(() => ({
  subgroupMember: { findMany: vi.fn() },
  event: { findMany: vi.fn() },
  sharedResource: { findMany: vi.fn() },
}));

vi.mock("../db.js", () => ({ prisma: bachecaRepository }));

it("exposes the shared-resource persistence contract", () => {
  const resource = Prisma.dmmf.datamodel.models.find((model) => model.name === "SharedResource");
  expect(resource?.fields.map((field) => field.name)).toEqual(expect.arrayContaining([
    "id", "url", "title", "description", "previewEnabled", "previewImageUrl",
    "previewSiteName", "isGlobal", "sortOrder", "previewFetchedAt",
    "createdAt", "updatedAt", "subgroups",
  ]));

  const subgroup = Prisma.dmmf.datamodel.models.find((model) => model.name === "Subgroup");
  expect(subgroup?.fields.map((field) => field.name)).toEqual(expect.arrayContaining(["resources"]));
});

let counter = 0;
function ev(overrides: Partial<SectionInputEvent> & { tagNames?: string[] }): SectionInputEvent {
  counter++;
  const { tagNames = [], ...rest } = overrides;
  return {
    id: `e${counter}`,
    title: `Evento ${counter}`,
    description: null,
    location: null,
    startsAt: new Date(Date.now() + counter * 3600e3),
    endsAt: new Date(Date.now() + counter * 3600e3 + 1800e3),
    allDay: false,
    isGlobal: false,
    tags: tagNames.map((name) => ({ tag: { name, color: null } })),
    ...rest,
  };
}

describe("buildSections (Flusso 5 — primi 3 per TAG)", () => {
  it("caps each TAG section at 3 events, keeping chronological order", async () => {
    const { buildSections, EVENTS_PER_TAG } = await import("./bachecaService.js");
    const events = [1, 2, 3, 4, 5].map(() => ev({ tagNames: ["RIUNIONI"] }));
    const sections = buildSections(events);
    expect(sections).toHaveLength(1);
    expect(sections[0].tag).toBe("RIUNIONI");
    expect(sections[0].events).toHaveLength(EVENTS_PER_TAG);
    expect(sections[0].events.map((e) => e.id)).toEqual(
      events.slice(0, 3).map((e) => e.id)
    );
  });

  it("puts one event under every one of its TAGs", async () => {
    const { buildSections } = await import("./bachecaService.js");
    const sections = buildSections([ev({ tagNames: ["GITE", "CORSI"] })]);
    expect(sections.map((s) => s.tag).sort()).toEqual(["CORSI", "GITE"]);
    expect(sections.every((s) => s.events.length === 1)).toBe(true);
  });

  it("groups untagged events under ALTRO, sorted last", async () => {
    const { buildSections, UNTAGGED_SECTION } = await import("./bachecaService.js");
    const sections = buildSections([ev({ tagNames: [] }), ev({ tagNames: ["RIUNIONI"] })]);
    expect(sections.map((s) => s.tag)).toEqual(["RIUNIONI", UNTAGGED_SECTION]);
  });

  it("sorts sections alphabetically (it locale)", async () => {
    const { buildSections } = await import("./bachecaService.js");
    const sections = buildSections([
      ev({ tagNames: ["RIUNIONI"] }),
      ev({ tagNames: ["CORSI"] }),
      ev({ tagNames: ["GITE"] }),
    ]);
    expect(sections.map((s) => s.tag)).toEqual(["CORSI", "GITE", "RIUNIONI"]);
  });

  it("returns empty array for no events", async () => {
    const { buildSections } = await import("./bachecaService.js");
    expect(buildSections([])).toEqual([]);
  });
});

it("aggregates ordered resources visible to a subgroup with unchanged event sections", async () => {
  const visibleResources = [
    {
      id: "r-global",
      url: "https://example.org/global",
      title: "Global resource",
      description: null,
      previewEnabled: true,
      previewImageUrl: null,
      previewSiteName: null,
      previewFetchedAt: null,
      isGlobal: true,
      sortOrder: 1,
      createdAt: new Date("2026-09-01T09:01:00.000Z"),
      updatedAt: new Date("2026-09-01T09:01:00.000Z"),
      subgroups: [],
    },
    {
      id: "r-g1",
      url: "https://example.org/g1",
      title: "G1 resource",
      description: null,
      previewEnabled: false,
      previewImageUrl: null,
      previewSiteName: null,
      previewFetchedAt: null,
      isGlobal: false,
      sortOrder: 0,
      createdAt: new Date("2026-09-01T09:00:00.000Z"),
      updatedAt: new Date("2026-09-01T09:00:00.000Z"),
      subgroups: [{ subgroupId: "g1" }],
    },
    {
      id: "r-g2",
      url: "https://example.org/g2",
      title: "G2 resource",
      description: null,
      previewEnabled: true,
      previewImageUrl: null,
      previewSiteName: null,
      previewFetchedAt: null,
      isGlobal: false,
      sortOrder: 2,
      createdAt: new Date("2026-09-01T09:02:00.000Z"),
      updatedAt: new Date("2026-09-01T09:02:00.000Z"),
      subgroups: [{ subgroupId: "g2" }],
    },
  ];
  const events = [ev({ id: "event-1", tagNames: ["RIUNIONI"] })];
  bachecaRepository.subgroupMember.findMany.mockResolvedValue([{ subgroupId: "g1" }]);
  bachecaRepository.sharedResource.findMany.mockResolvedValue(visibleResources);
  bachecaRepository.event.findMany.mockResolvedValue(events);

  const { bachecaForUser, buildSections } = await import("./bachecaService.js");
  const expectedEventSections = buildSections(events);
  const payload = await bachecaForUser("teacher-1");

  expect(payload.resources.map((resource) => resource.id)).toEqual(["r-g1", "r-global"]);
  expect(payload.resources.map((resource) => resource.sortOrder)).toEqual([0, 1]);
  expect(payload.resources).not.toContainEqual(expect.objectContaining({ id: "r-g2" }));
  expect(payload.eventSections).toEqual(expectedEventSections);
});
