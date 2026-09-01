import type { RequestHandler } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashFeedToken } from "../services/calendarFeedCredential.js";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));
const linksMock = vi.hoisted(() => ({
  calendarLinksForUser: vi.fn(),
  rotateUserFeedCredential: vi.fn(),
}));
const feedMock = vi.hoisted(() => ({ loadPersonalCalendar: vi.fn() }));

vi.mock("../db.js", () => ({ prisma: prismaMock }));
vi.mock("../services/calendarLinks.js", () => linksMock);
vi.mock("../services/personalCalendarFeed.js", () => feedMock);

import { calendarFeedRouter, calendarLinksRouter } from "./calendarFeed.js";

function handler(router: typeof calendarFeedRouter, path: string, method: "get" | "post", index = 0): RequestHandler {
  const layer = router.stack.find(
    (candidate) => candidate.route?.path === path && candidate.route.methods[method]
  );
  if (!layer) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
  return layer.route.stack[index]?.handle as RequestHandler;
}

function response() {
  let resolve!: () => void;
  const done = new Promise<void>((doneResolve) => {
    resolve = doneResolve;
  });
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(() => resolve()),
    set: vi.fn().mockReturnThis(),
    send: vi.fn(() => resolve()),
    end: vi.fn(() => resolve()),
  };
  return { res, done };
}

async function run(routeHandler: RequestHandler, req: Record<string, unknown>) {
  const { res, done } = response();
  routeHandler(req as never, res as never, (error?: unknown) => {
    if (error) throw error;
  });
  await done;
  return res;
}

const user = { id: "u1", email: "kevin.delugan@rainerum.it", isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue(user);
  prismaMock.user.update.mockResolvedValue(user);
  linksMock.calendarLinksForUser.mockResolvedValue({ personalFeedEligible: true });
  linksMock.rotateUserFeedCredential.mockResolvedValue({ personalFeedEligible: true });
  feedMock.loadPersonalCalendar.mockResolvedValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
});

describe("calendar links routes", () => {
  it("requires authentication before returning or rotating links", async () => {
    const getAuth = handler(calendarLinksRouter, "/", "get", 0);
    const rotateAuth = handler(calendarLinksRouter, "/rotate", "post", 0);

    const getResponse = await run(getAuth, {});
    const rotateResponse = await run(rotateAuth, {});

    expect(getResponse.status).toHaveBeenCalledWith(401);
    expect(rotateResponse.status).toHaveBeenCalledWith(401);
  });

  it("returns links and rotates them for the authenticated user", async () => {
    const getLinks = handler(calendarLinksRouter, "/", "get", 1);
    const rotateLinks = handler(calendarLinksRouter, "/rotate", "post", 1);

    const getResponse = await run(getLinks, { user });
    const rotateResponse = await run(rotateLinks, { user });

    expect(linksMock.calendarLinksForUser).toHaveBeenCalledWith("u1");
    expect(linksMock.rotateUserFeedCredential).toHaveBeenCalledWith("u1");
    expect(getResponse.json).toHaveBeenCalledWith({ personalFeedEligible: true });
    expect(rotateResponse.json).toHaveBeenCalledWith({ personalFeedEligible: true });
  });
});

describe("public calendar feed route", () => {
  it("returns a generic 404 for an unknown token and logs only the status", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const res = await run(handler(calendarFeedRouter, "/:token.ics", "get"), {
      params: { token: "unknown-token" },
      header: vi.fn(),
    });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith("Calendario non disponibile");
    expect(info).toHaveBeenCalledWith("calendar_feed status=404");
    expect(JSON.stringify(info.mock.calls)).not.toContain("unknown-token");
  });

  it("returns a generic 410 for a known but inactive subscription", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const res = await run(handler(calendarFeedRouter, "/:token.ics", "get"), {
      params: { token: "known-token" },
      header: vi.fn(),
    });

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.send).toHaveBeenCalledWith("Calendario non disponibile");
    expect(info).toHaveBeenCalledWith("calendar_feed status=410");
    expect(JSON.stringify(info.mock.calls)).not.toContain("known-token");
    expect(JSON.stringify(info.mock.calls)).not.toContain(user.email);
  });

  it("renders the calendar before returning a private 200 response and records the fetch", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const res = await run(handler(calendarFeedRouter, "/:token.ics", "get"), {
      params: { token: "known-token" },
      header: vi.fn(() => undefined),
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { calendarFeedTokenHash: hashFeedToken("known-token") } })
    );
    expect(feedMock.loadPersonalCalendar).toHaveBeenCalledWith(
      "u1",
      "http://localhost:3000/calendar/feed/known-token.ics"
    );
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="intercomunica.ics"',
        "Cache-Control": "private, no-cache",
        ETag: expect.stringMatching(/^"[A-Za-z0-9_-]+"$/),
      })
    );
    expect(res.send).toHaveBeenCalledWith("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { calendarFeedLastFetchedAt: expect.any(Date) } })
    );
    expect(info).toHaveBeenCalledWith("calendar_feed status=200");
  });

  it("returns 304 without a body and still records a successful fetch", async () => {
    const routeHandler = handler(calendarFeedRouter, "/:token.ics", "get");
    const first = await run(routeHandler, {
      params: { token: "known-token" },
      header: vi.fn(() => undefined),
    });
    const etag = (first.set.mock.calls[0]?.[0] as { ETag: string }).ETag;
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const res = await run(routeHandler, {
      params: { token: "known-token" },
      header: vi.fn(() => etag),
    });

    expect(res.status).toHaveBeenCalledWith(304);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.send).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledWith("calendar_feed status=304");
  });

  it("returns a generic 503 when calendar generation fails", async () => {
    feedMock.loadPersonalCalendar.mockRejectedValue(new Error("database unavailable"));
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const res = await run(handler(calendarFeedRouter, "/:token.ics", "get"), {
      params: { token: "known-token" },
      header: vi.fn(),
    });

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.send).toHaveBeenCalledWith("Calendario temporaneamente non disponibile");
    expect(res.send).not.toHaveBeenCalledWith(expect.stringContaining("VCALENDAR"));
    expect(info).toHaveBeenCalledWith("calendar_feed status=503");
  });
});
