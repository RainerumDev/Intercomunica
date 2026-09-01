import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, signSession } from "./auth/session.js";
import { hashFeedToken } from "./services/calendarFeedCredential.js";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));
const feedMock = vi.hoisted(() => ({ loadPersonalCalendar: vi.fn() }));

vi.mock("./db.js", () => ({ prisma: prismaMock }));
vi.mock("./services/personalCalendarFeed.js", () => feedMock);

import { createApp } from "./index.js";

async function get(path: string, cookie?: string): Promise<{
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    return await new Promise((resolve, reject) => {
      const request = http.get(
        { hostname: "127.0.0.1", port, path, headers: cookie ? { Cookie: cookie } : undefined },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => resolve({ status: response.statusCode ?? 0, body, headers: response.headers }));
        }
      );
      request.on("error", reject);
    });
  } finally {
    server.close();
    await once(server, "close");
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation(async ({ where }) => {
    if (where.calendarFeedTokenHash === hashFeedToken("feed-token")) {
      return { id: "feed-user", email: "teacher@rainerum.it", isActive: true };
    }
    throw new Error("session lookup must not run for a public feed request");
  });
  prismaMock.user.update.mockResolvedValue({});
  feedMock.loadPersonalCalendar.mockResolvedValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public calendar feed application wiring", () => {
  it("bypasses session-cookie processing for no, active, inactive, and failing-session cookies", async () => {
    const activeCookie = `${SESSION_COOKIE}=${signSession({
      id: "active-session-user",
      email: "active@rainerum.it",
      role: "TEACHER",
    })}`;
    const inactiveCookie = `${SESSION_COOKIE}=${signSession({
      id: "inactive-session-user",
      email: "inactive@rainerum.it",
      role: "TEACHER",
    })}`;
    const failingSessionCookie = `${SESSION_COOKIE}=${signSession({
      id: "session-db-failure",
      email: "failure@rainerum.it",
      role: "TEACHER",
    })}`;

    for (const cookie of [undefined, activeCookie, inactiveCookie, failingSessionCookie]) {
      const response = await get("/calendar/feed/feed-token.ics", cookie);
      expect(response.status).toBe(200);
      expect(response.body).toBe("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
      expect(response.headers["set-cookie"]).toBeUndefined();
    }

    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(4);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { calendarFeedTokenHash: hashFeedToken("feed-token") } })
    );
  });
});
