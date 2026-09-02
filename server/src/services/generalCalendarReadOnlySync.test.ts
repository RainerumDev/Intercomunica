import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  appConfigFindUnique: vi.fn(),
  appConfigUpdate: vi.fn(),
  eventFindMany: vi.fn(),
}));

const google = vi.hoisted(() => ({
  listCalendarChanges: vi.fn(),
}));

const eventOperations = vi.hoisted(() => ({
  createEvent: vi.fn(),
  deleteEventEverywhere: vi.fn(),
  ensureGeneralCopy: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: {
    appConfig: { findUnique: db.appConfigFindUnique, update: db.appConfigUpdate },
    event: { findMany: db.eventFindMany },
  },
}));

vi.mock("../google/calendar.js", () => ({
  fromGoogleEvent: vi.fn(),
  isWritableCalendarAccessRole: (role: string | null | undefined) =>
    role === "writer" || role === "owner",
  listCalendarChanges: google.listCalendarChanges,
  stopCalendarWatch: vi.fn(),
  watchCalendar: vi.fn(),
}));

vi.mock("./eventService.js", () => eventOperations);

describe("read-only general calendar synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.appConfigFindUnique.mockResolvedValue({
      id: 1,
      generalCalendarId: "general-calendar",
      generalCalendarName: null,
      generalCalendarAccessRole: null,
      generalCalendarSyncToken: "sync-1",
    });
    db.appConfigUpdate.mockResolvedValue({});
    db.eventFindMany.mockResolvedValue([]);
    google.listCalendarChanges.mockResolvedValue({
      items: [],
      nextSyncToken: "sync-2",
      calendarName: "Calendario generale",
      accessRole: "reader",
    });
  });

  it("persists reader metadata and the next token without outbound event writes", async () => {
    db.eventFindMany.mockResolvedValue([{ id: "local-only-event" }]);
    const { syncGeneralCalendar } = await import("./generalCalendarSync.js");

    await expect(syncGeneralCalendar()).resolves.toEqual({
      imported: 0,
      updated: 0,
      deleted: 0,
    });

    expect(db.appConfigUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 1 },
      data: {
        generalCalendarName: "Calendario generale",
        generalCalendarAccessRole: "reader",
      },
    });
    expect(db.appConfigUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 1 },
      data: {
        generalCalendarSyncToken: "sync-2",
        generalCalendarLastSyncAt: expect.any(Date),
        generalCalendarLastError: null,
      },
    });
    expect(db.eventFindMany).not.toHaveBeenCalled();
    expect(eventOperations.ensureGeneralCopy).not.toHaveBeenCalled();
    expect(eventOperations.createEvent).not.toHaveBeenCalled();
    expect(eventOperations.updateEvent).not.toHaveBeenCalled();
  });
});
