import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  tagUpsert: vi.fn(),
  eventCreate: vi.fn(),
  eventUpdate: vi.fn(),
  eventFindUniqueOrThrow: vi.fn(),
  eventDelete: vi.fn(),
  userFindMany: vi.fn(),
  eventInstanceFindMany: vi.fn(),
  eventInstanceCreate: vi.fn(),
  eventInstanceUpdate: vi.fn(),
  eventInstanceDelete: vi.fn(),
  appConfigFindUnique: vi.fn(),
}));

const google = vi.hoisted(() => ({
  insertEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: {
    tag: { upsert: db.tagUpsert },
    event: {
      create: db.eventCreate,
      update: db.eventUpdate,
      findUniqueOrThrow: db.eventFindUniqueOrThrow,
      delete: db.eventDelete,
    },
    user: { findMany: db.userFindMany },
    eventInstance: {
      findMany: db.eventInstanceFindMany,
      create: db.eventInstanceCreate,
      update: db.eventInstanceUpdate,
      delete: db.eventInstanceDelete,
    },
    appConfig: { findUnique: db.appConfigFindUnique },
  },
}));

vi.mock("../google/calendar.js", () => ({
  insertEvent: google.insertEvent,
  updateEvent: google.updateEvent,
  deleteEvent: google.deleteEvent,
  isWritableCalendarAccessRole: (role: string | null | undefined) =>
    role === "writer" || role === "owner",
}));

const event = {
  id: "event-1",
  title: "Collegio",
  description: null,
  location: null,
  startsAt: new Date("2026-09-01T08:00:00.000Z"),
  endsAt: new Date("2026-09-01T10:00:00.000Z"),
  allDay: false,
  isGlobal: false,
  bachecaOnly: false,
  generalGoogleEventId: "general-event-1",
  tags: [{ tagId: "tag-1", tag: { id: "tag-1", name: "RIUNIONE", color: null } }],
  subgroups: [{ eventId: "event-1", subgroupId: "group-1" }],
};

const input = {
  title: event.title,
  description: event.description,
  location: event.location,
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  allDay: event.allDay,
  isGlobal: event.isGlobal,
  bachecaOnly: event.bachecaOnly,
  subgroupIds: ["group-1"],
  tagNames: ["RIUNIONE"],
};

beforeEach(() => {
  for (const mock of [...Object.values(db), ...Object.values(google)]) mock.mockReset();
  db.tagUpsert.mockResolvedValue({ id: "tag-1" });
  db.eventCreate.mockResolvedValue({ id: "event-1" });
  db.eventUpdate.mockResolvedValue(event);
  db.eventFindUniqueOrThrow.mockResolvedValue(event);
  db.eventDelete.mockResolvedValue(event);
  db.appConfigFindUnique.mockResolvedValue({
    generalCalendarId: "general-calendar",
    generalCalendarAccessRole: "writer",
  });
  db.userFindMany.mockResolvedValue([
    { id: "user-1", email: "docente@rainerum.it", calendarId: "personal-calendar" },
  ]);
  db.eventInstanceFindMany.mockResolvedValue([]);
  db.eventInstanceCreate.mockResolvedValue({ id: "instance-1" });
  google.insertEvent.mockImplementation(async (calendarId: string) => `${calendarId}-event`);
  google.updateEvent.mockResolvedValue(undefined);
  google.deleteEvent.mockResolvedValue(undefined);
});

describe("event writes after personal calendar retirement", () => {
  it("creates at most the general-calendar copy and no personal instance", async () => {
    db.eventFindUniqueOrThrow.mockResolvedValue({ ...event, generalGoogleEventId: null });
    const { createEvent } = await import("./eventService.js");

    await createEvent(input, "admin-1");

    expect(google.insertEvent).toHaveBeenCalledOnce();
    expect(google.insertEvent).toHaveBeenCalledWith(
      "general-calendar",
      expect.objectContaining({ appEventId: "event-1" })
    );
    expect(db.eventInstanceCreate).not.toHaveBeenCalled();
    expect(db.eventInstanceUpdate).not.toHaveBeenCalled();
    expect(db.eventInstanceDelete).not.toHaveBeenCalled();
    expect(db.eventInstanceFindMany).not.toHaveBeenCalled();
    expect(db.userFindMany).not.toHaveBeenCalled();
  });

  it("keeps a new event local when the general calendar is read-only", async () => {
    db.appConfigFindUnique.mockResolvedValue({
      generalCalendarId: "general-calendar",
      generalCalendarAccessRole: "reader",
    });
    db.eventFindUniqueOrThrow.mockResolvedValue({ ...event, generalGoogleEventId: null });
    const { createEvent } = await import("./eventService.js");

    await createEvent(input, "admin-1");

    expect(db.eventCreate).toHaveBeenCalledOnce();
    expect(google.insertEvent).not.toHaveBeenCalled();
    expect(google.updateEvent).not.toHaveBeenCalled();
  });

  it("keeps an event update local when the general calendar is read-only", async () => {
    db.appConfigFindUnique.mockResolvedValue({
      generalCalendarId: "general-calendar",
      generalCalendarAccessRole: "reader",
    });
    const { updateEvent } = await import("./eventService.js");

    await updateEvent("event-1", input);

    expect(db.eventUpdate).toHaveBeenCalled();
    expect(google.insertEvent).not.toHaveBeenCalled();
    expect(google.updateEvent).not.toHaveBeenCalled();
  });

  it("updates at most the general-calendar copy and no personal instance", async () => {
    db.eventInstanceFindMany.mockResolvedValue([
      {
        id: "instance-1",
        eventId: "event-1",
        userId: "user-1",
        calendarId: "personal-calendar",
        googleEventId: "personal-event-1",
      },
    ]);
    const { updateEvent } = await import("./eventService.js");

    await updateEvent("event-1", input);

    expect(google.updateEvent).toHaveBeenCalledOnce();
    expect(google.updateEvent).toHaveBeenCalledWith(
      "general-calendar",
      "general-event-1",
      expect.objectContaining({ appEventId: "event-1" })
    );
    expect(db.eventInstanceCreate).not.toHaveBeenCalled();
    expect(db.eventInstanceUpdate).not.toHaveBeenCalled();
    expect(db.eventInstanceDelete).not.toHaveBeenCalled();
    expect(db.eventInstanceFindMany).not.toHaveBeenCalled();
    expect(db.userFindMany).not.toHaveBeenCalled();
  });

  it("deletes at most the general-calendar copy before the database event", async () => {
    db.eventInstanceFindMany.mockResolvedValue([
      {
        id: "instance-1",
        eventId: "event-1",
        userId: "user-1",
        calendarId: "personal-calendar",
        googleEventId: "personal-event-1",
      },
    ]);
    const { deleteEventEverywhere } = await import("./eventService.js");

    await deleteEventEverywhere("event-1");

    expect(google.deleteEvent).toHaveBeenCalledOnce();
    expect(google.deleteEvent).toHaveBeenCalledWith(
      "general-calendar",
      "general-event-1"
    );
    expect(db.eventDelete).toHaveBeenCalledOnce();
    expect(db.eventDelete).toHaveBeenCalledWith({ where: { id: "event-1" } });
    expect(db.eventInstanceCreate).not.toHaveBeenCalled();
    expect(db.eventInstanceUpdate).not.toHaveBeenCalled();
    expect(db.eventInstanceDelete).not.toHaveBeenCalled();
    expect(db.eventInstanceFindMany).not.toHaveBeenCalled();
    expect(db.userFindMany).not.toHaveBeenCalled();
  });

  it("does not attempt to delete a linked Google event from a read-only calendar", async () => {
    db.appConfigFindUnique.mockResolvedValue({
      generalCalendarId: "general-calendar",
      generalCalendarAccessRole: "reader",
    });
    const { deleteEventEverywhere, ReadOnlyGeneralCalendarError } = await import(
      "./eventService.js"
    );

    await expect(deleteEventEverywhere("event-1")).rejects.toBeInstanceOf(
      ReadOnlyGeneralCalendarError
    );
    expect(google.deleteEvent).not.toHaveBeenCalled();
    expect(db.eventDelete).not.toHaveBeenCalled();
  });
});
