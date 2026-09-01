import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: { user: { findUnique: db.findUnique, upsert: db.upsert } },
}));

describe("group-based access", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = "presidenza@rainerum.it";
    process.env.CALENDAR_EXCLUDED_EMAILS = "segreteria@rainerum.it";
    db.findUnique.mockReset();
    db.upsert.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.CALENDAR_EXCLUDED_EMAILS;
  });

  it("allows active members and bypass accounts but rejects inactive regular users", async () => {
    const sessionModule = await import("./session.js");
    const canAccessApp = (
      sessionModule as typeof sessionModule & {
        canAccessApp: (email: string, isActive: boolean | undefined) => boolean;
      }
    ).canAccessApp;

    expect(canAccessApp("docente@rainerum.it", true)).toBe(true);
    expect(canAccessApp("docente@rainerum.it", false)).toBe(false);
    expect(canAccessApp("docente@rainerum.it", undefined)).toBe(false);
    expect(canAccessApp("presidenza@rainerum.it", false)).toBe(true);
    expect(canAccessApp("segreteria@rainerum.it", false)).toBe(true);
  });

  it("does not create a missing regular user during login", async () => {
    db.findUnique.mockResolvedValue(null);
    db.upsert.mockResolvedValue({
      id: "new-user",
      email: "estraneo@rainerum.it",
      role: "TEACHER",
    });
    const { upsertLoginUser } = await import("./session.js");

    const result = await upsertLoginUser({ email: "estraneo@rainerum.it" });

    expect(result).toBeNull();
  });

  it("invalidates an existing session when a regular user becomes inactive", async () => {
    db.findUnique.mockResolvedValue({
      id: "teacher-1",
      email: "docente@rainerum.it",
      role: "TEACHER",
      isActive: false,
    });
    const { SESSION_COOKIE, sessionMiddleware, signSession } = await import("./session.js");
    const req = {
      cookies: {
        [SESSION_COOKIE]: signSession({
          id: "teacher-1",
          email: "docente@rainerum.it",
          role: "TEACHER",
        }),
      },
    } as Request;
    const res = { clearCookie: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await sessionMiddleware(req, res, next);

    expect(req.user).toBeUndefined();
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE);
    expect(next).toHaveBeenCalledOnce();
  });
});
