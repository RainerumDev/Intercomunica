import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  appConfig: { findUnique: vi.fn() },
}));

vi.mock("../db.js", () => ({ prisma: prismaMock }));

import { calendarLinksForUser } from "./calendarLinks.js";

process.env.BASE_URL = "http://localhost:3000";

beforeEach(() => {
  vi.clearAllMocks();
  const storedUser = {
    id: "u1",
    email: "kevin.delugan@rainerum.it",
    isActive: true,
    calendarFeedTokenHash: null,
    calendarFeedTokenEnc: null,
    calendarFeedTokenIssuedAt: null,
    calendarFeedLastFetchedAt: null,
  };
  prismaMock.user.findUnique.mockImplementation(async () => ({ ...storedUser }));
  prismaMock.user.updateMany.mockImplementation(async ({ data }) => {
    Object.assign(storedUser, data);
    return { count: 1 };
  });
  prismaMock.appConfig.findUnique.mockResolvedValue({ generalCalendarId: null });
});

describe("calendar subscription links with an HTTP public origin", () => {
  it("uses webcal for the personal subscription URL", async () => {
    const links = await calendarLinksForUser("u1");

    expect(links.personalIcsUrl).toMatch(/^http:\/\/localhost:3000\/calendar\/feed\//);
    expect(links.personalWebcalUrl).toMatch(/^webcal:\/\/localhost:3000\/calendar\/feed\//);
  });
});
