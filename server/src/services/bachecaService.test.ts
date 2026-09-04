import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { SectionInputEvent } from "./bachecaService.js";

const bachecaRepository = vi.hoisted(() => ({
  subgroupMember: { findMany: vi.fn() },
  event: { findMany: vi.fn() },
}));

vi.mock("../db.js", () => ({ prisma: bachecaRepository }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
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

describe("buildSections", () => {
  it("keeps every future event in each category", async () => {
    const { buildSections } = await import("./bachecaService.js");
    const events = [1, 2, 3, 4].map((index) => ev({
      id: `event-${index}`,
      startsAt: new Date(`2026-09-${10 + index}T08:00:00.000Z`),
      tags: [{ tag: { name: "Riunioni", color: "#B8181B" } }],
    }));

    expect(buildSections(events)[0].events.map(({ id }) => id)).toEqual([
      "event-1", "event-2", "event-3", "event-4",
    ]);
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

it("returns event sections without bacheca resources", async () => {
  const events = [ev({ id: "event-1", tagNames: ["RIUNIONI"] })];
  bachecaRepository.subgroupMember.findMany.mockResolvedValue([{ subgroupId: "g1" }]);
  bachecaRepository.event.findMany.mockResolvedValue(events);

  const { bachecaForUser, buildSections } = await import("./bachecaService.js");
  const expectedEventSections = buildSections(events);
  const payload = await bachecaForUser("teacher-1");

  expect(payload).toEqual({ eventSections: expectedEventSections });
});

describe("eventSectionsForUser query contract", () => {
  const fixedNow = new Date("2026-09-04T07:15:00.000Z");

  it("filters by unexpired global or matching-subgroup events and orders by start", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    bachecaRepository.subgroupMember.findMany.mockResolvedValue([
      { subgroupId: "class-1" },
      { subgroupId: "class-2" },
    ]);
    bachecaRepository.event.findMany.mockResolvedValue([]);

    const { eventSectionsForUser } = await import("./bachecaService.js");
    await eventSectionsForUser("teacher-with-groups");

    expect(bachecaRepository.subgroupMember.findMany).toHaveBeenCalledWith({
      where: { userId: "teacher-with-groups" },
    });
    expect(bachecaRepository.event.findMany).toHaveBeenCalledWith({
      where: {
        endsAt: { gte: fixedNow },
        OR: [
          { isGlobal: true },
          {
            isGlobal: false,
            subgroups: { some: { subgroupId: { in: ["class-1", "class-2"] } } },
          },
        ],
      },
      include: { tags: { include: { tag: true } } },
      orderBy: { startsAt: "asc" },
    });
  });

  it("queries only global unexpired events when the user has no memberships", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    bachecaRepository.subgroupMember.findMany.mockResolvedValue([]);
    bachecaRepository.event.findMany.mockResolvedValue([]);

    const { eventSectionsForUser } = await import("./bachecaService.js");
    await eventSectionsForUser("teacher-without-groups");

    expect(bachecaRepository.event.findMany).toHaveBeenCalledWith({
      where: {
        endsAt: { gte: fixedNow },
        OR: [{ isGlobal: true }],
      },
      include: { tags: { include: { tag: true } } },
      orderBy: { startsAt: "asc" },
    });
  });
});
