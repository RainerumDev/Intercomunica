import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  appConfig: { findUnique: vi.fn() },
}));

vi.mock("../db.js", () => ({ prisma: prismaMock }));

import {
  calendarLinksForUser,
  ensureUserFeedCredential,
  generalGoogleCalendarUrl,
  isPersonalFeedEligible,
  rotateUserFeedCredential,
} from "./calendarLinks.js";

process.env.BASE_URL = "https://intercomunica.rainerum.delugan.net";
process.env.ADMIN_EMAILS = "preside@rainerum.it";
process.env.CALENDAR_EXCLUDED_EMAILS = "segreteria@rainerum.it";

type StoredUser = {
  id: string;
  email: string;
  isActive: boolean;
  calendarFeedTokenHash: string | null;
  calendarFeedTokenEnc: string | null;
  calendarFeedTokenIssuedAt: Date | null;
  calendarFeedLastFetchedAt: Date | null;
};

let storedUser: StoredUser;

beforeEach(() => {
  vi.clearAllMocks();
  storedUser = {
    id: "u1",
    email: "Kevin.Delugan@rainerum.it",
    isActive: true,
    calendarFeedTokenHash: null,
    calendarFeedTokenEnc: null,
    calendarFeedTokenIssuedAt: null,
    calendarFeedLastFetchedAt: null,
  };
  prismaMock.user.findUnique.mockImplementation(async () => ({ ...storedUser }));
  prismaMock.user.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.calendarFeedTokenHash === null && storedUser.calendarFeedTokenHash !== null) {
      return { count: 0 };
    }
    Object.assign(storedUser, data);
    return { count: 1 };
  });
  prismaMock.user.update.mockImplementation(async ({ data }) => {
    Object.assign(storedUser, data);
    return { ...storedUser };
  });
  prismaMock.appConfig.findUnique.mockResolvedValue({ generalCalendarId: "general@group.calendar.google.com" });
});

describe("calendar subscription links", () => {
  it("encodes the general Google Calendar URL", () => {
    expect(generalGoogleCalendarUrl("calendar id@group.calendar.google.com")).toBe(
      "https://calendar.google.com/calendar/embed?src=calendar%20id%40group.calendar.google.com&ctz=Europe%2FRome"
    );
  });

  it("creates and redisplays a stable personal ICS and webcal URL", async () => {
    const initial = await calendarLinksForUser("u1");
    const redisplayed = await calendarLinksForUser("u1");

    expect(initial.personalIcsUrl).toMatch(
      /^https:\/\/intercomunica\.rainerum\.delugan\.net\/calendar\/feed\/kevin\.delugan-.+\.ics$/
    );
    expect(initial.personalWebcalUrl).toMatch(
      /^webcal:\/\/intercomunica\.rainerum\.delugan\.net\/calendar\/feed\/kevin\.delugan-.+\.ics$/
    );
    expect(redisplayed.personalIcsUrl).toBe(initial.personalIcsUrl);
    expect(initial.personalFeedEligible).toBe(true);
  });

  it("does not create a personal feed for excluded accounts", async () => {
    storedUser.email = "segreteria@rainerum.it";

    const links = await calendarLinksForUser("u1");

    expect(links).toMatchObject({
      personalFeedEligible: false,
      personalIcsUrl: null,
      personalWebcalUrl: null,
      lastFetchedAt: null,
    });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("applies the active, inactive, admin-bypass, and excluded eligibility matrix", () => {
    expect(isPersonalFeedEligible({ email: "teacher@rainerum.it", isActive: true })).toBe(true);
    expect(isPersonalFeedEligible({ email: "teacher@rainerum.it", isActive: false })).toBe(false);
    expect(isPersonalFeedEligible({ email: "preside@rainerum.it", isActive: false })).toBe(true);
    expect(isPersonalFeedEligible({ email: "segreteria@rainerum.it", isActive: true })).toBe(false);
  });

  it("returns the same stored credential to concurrent first requests", async () => {
    const [first, second] = await Promise.all([
      ensureUserFeedCredential("u1"),
      ensureUserFeedCredential("u1"),
    ]);

    expect(first.token).toBe(second.token);
    expect(first.tokenHash).toBe(storedUser.calendarFeedTokenHash);
    expect(prismaMock.user.updateMany).toHaveBeenCalledTimes(2);
  });

  it("rotates a credential and invalidates its former hash", async () => {
    const oldCredential = await ensureUserFeedCredential("u1");
    const links = await rotateUserFeedCredential("u1");

    expect(storedUser.calendarFeedTokenHash).not.toBe(oldCredential.tokenHash);
    expect(links.personalIcsUrl).not.toContain(oldCredential.token);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });
});
