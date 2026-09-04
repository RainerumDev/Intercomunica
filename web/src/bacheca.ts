import { normalizeSearchText } from "./search";
import type { BachecaEvent, BachecaSection } from "./types";

const romeDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function romeDateParts(date: Date): DateParts {
  const parts = romeDateFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(
    parts.find((part) => part.type === type)?.value,
  );

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function romeDayStart(year: number, month: number, day: number): Date {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const actual = romeDateParts(candidate);
  const desiredUtc = Date.UTC(year, month - 1, day);
  const actualUtc = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute,
  );

  return new Date(candidate.getTime() - (actualUtc - desiredUtc));
}

export function flattenBachecaEvents(sections: readonly BachecaSection[]): BachecaEvent[] {
  const eventsById = new Map<string, BachecaEvent>();

  for (const section of sections) {
    for (const event of section.events) {
      const existing = eventsById.get(event.id);
      const tags = [...new Set([...(existing?.tags ?? []), ...event.tags, section.tag])];
      eventsById.set(event.id, { ...(existing ?? event), tags });
    }
  }

  return [...eventsById.values()].sort((left, right) => {
    const startsAtDifference = new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
    return startsAtDifference || left.id.localeCompare(right.id);
  });
}

export function filterBachecaEvents(
  events: readonly BachecaEvent[],
  query: string,
  category: string | null,
): BachecaEvent[] {
  const words = normalizeSearchText(query).split(/\s+/u).filter(Boolean);

  return events.filter((event) => {
    const haystack = normalizeSearchText([
      event.title,
      event.description ?? "",
      event.location ?? "",
      ...event.tags,
    ].join(" "));

    return (!category || event.tags.includes(category))
      && words.every((word) => haystack.includes(word));
  });
}

export function partitionBachecaEvents(
  events: readonly BachecaEvent[],
  now: Date,
): { today: BachecaEvent[]; upcoming: BachecaEvent[] } {
  const today = romeDateParts(now);
  const todayStart = romeDayStart(today.year, today.month, today.day);
  const tomorrowStart = romeDayStart(today.year, today.month, today.day + 1);

  return {
    today: events.filter((event) => {
      const startsAt = new Date(event.startsAt);
      const endsAt = new Date(event.endsAt);
      return startsAt < tomorrowStart && endsAt >= todayStart;
    }),
    upcoming: events.filter((event) => new Date(event.startsAt) >= tomorrowStart),
  };
}
