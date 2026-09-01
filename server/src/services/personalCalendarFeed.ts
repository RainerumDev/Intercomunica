import type { Prisma } from "@prisma/client";
import ical from "ical-generator";
import { prisma } from "../db.js";

export type PersonalFeedEvent = Prisma.EventGetPayload<{
  include: { tags: { include: { tag: true } } };
}>;

export function personalEventWhere(
  _userId: string,
  subgroupIds: string[]
): Prisma.EventWhereInput {
  return {
    bachecaOnly: false,
    OR: [
      { isGlobal: true },
      ...(subgroupIds.length > 0
        ? [{ isGlobal: false, subgroups: { some: { subgroupId: { in: subgroupIds } } } }]
        : []),
    ],
  };
}

export function renderPersonalCalendar(input: {
  user: { id: string; email: string; name: string | null };
  events: PersonalFeedEvent[];
  sourceUrl: string;
}): string {
  const calendar = ical({
    name: "Calendario personale Intercomunica",
    prodId: { company: "Intercomunica", product: "Personal calendar feed" },
    source: input.sourceUrl,
    url: input.sourceUrl,
    ttl: 3600,
  });

  for (const event of input.events) {
    calendar.createEvent({
      id: `${event.id}@intercomunica.rainerum.delugan.net`,
      start: event.startsAt,
      end: event.endsAt,
      allDay: event.allDay,
      summary: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      stamp: event.updatedAt,
      lastModified: event.updatedAt,
      categories: event.tags
        .map(({ tag }) => tag.name)
        .sort((left, right) => left.localeCompare(right, "it"))
        .map((name) => ({ name })),
    });
  }

  return calendar.toString();
}

export async function loadPersonalCalendar(userId: string, sourceUrl: string): Promise<string> {
  const memberships = await prisma.subgroupMember.findMany({ where: { userId } });
  const events = await prisma.event.findMany({
    where: personalEventWhere(userId, memberships.map((membership) => membership.subgroupId)),
    include: { tags: { include: { tag: true } } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  return renderPersonalCalendar({ user, events, sourceUrl });
}
