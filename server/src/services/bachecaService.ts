import { prisma } from "../db.js";
import { listResourcesForUser, type ResourceRecord } from "./sharedResourceService.js";

export interface BachecaEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  isGlobal: boolean;
  tags: string[];
}

export interface BachecaSection {
  tag: string;
  color: string | null;
  events: BachecaEvent[];
}

export type BachecaResource = ResourceRecord;

export interface BachecaPayload {
  resources: BachecaResource[];
  eventSections: BachecaSection[];
}

export const UNTAGGED_SECTION = "ALTRO";
export const EVENTS_PER_TAG = 3;

export interface SectionInputEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  isGlobal: boolean;
  tags: { tag: { name: string; color: string | null } }[];
}

/**
 * Pure sectioning logic (Flusso 5.2 — "primi 3 impegni per TAG").
 * Input events must already be visibility-filtered and sorted by startsAt asc.
 */
export function buildSections(events: SectionInputEvent[]): BachecaSection[] {
  const sections = new Map<string, BachecaSection>();
  for (const e of events) {
    const view: BachecaEvent = {
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      allDay: e.allDay,
      isGlobal: e.isGlobal,
      tags: e.tags.map((t) => t.tag.name),
    };
    const tagEntries =
      e.tags.length > 0
        ? e.tags.map((t) => ({ name: t.tag.name, color: t.tag.color }))
        : [{ name: UNTAGGED_SECTION, color: null }];
    for (const { name, color } of tagEntries) {
      let section = sections.get(name);
      if (!section) {
        section = { tag: name, color, events: [] };
        sections.set(name, section);
      }
      if (section.events.length < EVENTS_PER_TAG) {
        section.events.push(view);
      }
    }
  }

  // stable order: alphabetical, ALTRO last
  return [...sections.values()].sort((a, b) => {
    if (a.tag === UNTAGGED_SECTION) return 1;
    if (b.tag === UNTAGGED_SECTION) return -1;
    return a.tag.localeCompare(b.tag, "it");
  });
}

/**
 * Flusso 5 — bacheca personalizzata.
 * Per TAG: max 3 upcoming events visible to the user, i.e. events that are
 * global ("visibile a tutti") or shared with a subgroup the user belongs to.
 */
export async function eventSectionsForUser(userId: string): Promise<BachecaSection[]> {
  const memberships = await prisma.subgroupMember.findMany({ where: { userId } });
  const subgroupIds = memberships.map((m) => m.subgroupId);

  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      endsAt: { gte: now },
      OR: [
        { isGlobal: true },
        ...(subgroupIds.length > 0
          ? [{ isGlobal: false, subgroups: { some: { subgroupId: { in: subgroupIds } } } }]
          : []),
      ],
    },
    include: { tags: { include: { tag: true } } },
    orderBy: { startsAt: "asc" },
  });

  return buildSections(events);
}

export async function bachecaForUser(userId: string): Promise<BachecaPayload> {
  const [resources, eventSections] = await Promise.all([
    listResourcesForUser(userId),
    eventSectionsForUser(userId),
  ]);
  return { resources, eventSections };
}
