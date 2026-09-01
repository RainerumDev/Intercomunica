import { describe, expect, it } from "vitest";
import {
  personalEventWhere,
  renderPersonalCalendar,
  type PersonalFeedEvent,
} from "./personalCalendarFeed.js";

const events: PersonalFeedEvent[] = [
  {
    id: "event-1",
    title: "Riunione; docenti, sede centrale",
    description: "Prima riga\nSeconda riga",
    location: "Aula, 2",
    startsAt: new Date("2026-09-10T08:00:00.000Z"),
    endsAt: new Date("2026-09-10T09:30:00.000Z"),
    allDay: false,
    isGlobal: false,
    bachecaOnly: false,
    generalGoogleEventId: null,
    googleOccurrenceKey: null,
    createdById: null,
    createdAt: new Date("2026-09-01T08:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:34:56.000Z"),
    tags: [{ eventId: "event-1", tagId: "tag-1", tag: { id: "tag-1", name: "COLLEGIO", color: null } }],
  },
  {
    id: "event-2",
    title: "Festa di istituto",
    description: null,
    location: null,
    startsAt: new Date("2026-09-11T00:00:00.000Z"),
    endsAt: new Date("2026-09-12T00:00:00.000Z"),
    allDay: true,
    isGlobal: true,
    bachecaOnly: false,
    generalGoogleEventId: null,
    googleOccurrenceKey: null,
    createdById: null,
    createdAt: new Date("2026-09-01T08:00:00.000Z"),
    updatedAt: new Date("2026-09-02T10:00:00.000Z"),
    tags: [],
  },
] as PersonalFeedEvent[];

describe("personal calendar feeds", () => {
  it("selects only global or current-subgroup events that are not bacheca-only", () => {
    expect(personalEventWhere("u1", ["g1"])).toEqual({
      bachecaOnly: false,
      OR: [
        { isGlobal: true },
        { isGlobal: false, subgroups: { some: { subgroupId: { in: ["g1"] } } } },
      ],
    });
  });

  it("renders stable RFC 5545 timed and all-day events", () => {
    const input = {
      user: { id: "u1", email: "kevin.delugan@rainerum.it", name: "Kevin Delugan" },
      events,
      sourceUrl: "https://intercomunica.rainerum.delugan.net/calendar/feed/kevin-secret.ics",
    };

    const ics = renderPersonalCalendar(input);

    expect(ics).toContain("UID:event-1@intercomunica.rainerum.delugan.net");
    expect(ics).toContain("DTSTART:20260910T080000Z");
    expect(ics).toContain("DTEND:20260910T093000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260911");
    expect(ics).toContain("DTEND;VALUE=DATE:20260912");
    expect(ics).toContain("SUMMARY:Riunione\\; docenti\\, sede centrale");
    expect(ics).toContain("DESCRIPTION:Prima riga\\nSeconda riga");
    expect(ics).toContain("LOCATION:Aula\\, 2");
    expect(ics).toContain("LAST-MODIFIED:20260901T123456Z");
    expect(ics).not.toContain("bachecaOnly");
    expect(renderPersonalCalendar(input)).toBe(renderPersonalCalendar(input));
  });

  it("serializes categories in a stable order independent of relation order", () => {
    const input = {
      user: { id: "u1", email: "kevin.delugan@rainerum.it", name: "Kevin Delugan" },
      events: [
        {
          ...events[0],
          tags: [
            { eventId: "event-1", tagId: "tag-z", tag: { id: "tag-z", name: "ZETA", color: null } },
            { eventId: "event-1", tagId: "tag-a", tag: { id: "tag-a", name: "ALFA", color: null } },
          ],
        },
      ],
      sourceUrl: "https://intercomunica.rainerum.delugan.net/calendar/feed/kevin-secret.ics",
    };

    expect(renderPersonalCalendar(input)).toContain("CATEGORIES:ALFA,ZETA");
  });
});
