import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resourceOperations = vi.hoisted(() => ({
  listResourcesForUser: vi.fn(),
}));

const database = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../db.js", () => ({ prisma: database.prisma }));

vi.mock("../services/sharedResourceService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/sharedResourceService.js")>();
  return { ...actual, ...resourceOperations };
});

import { SESSION_COOKIE, signSession } from "../auth/session.js";
import { createApp } from "../index.js";

const teacherCookie = `${SESSION_COOKIE}=${signSession({
  id: "teacher-1", email: "teacher@example.org", role: "TEACHER",
})}`;

const visibleResource = {
  id: "resource-1",
  url: "https://example.org/guide",
  title: "Guide",
  description: null,
  previewEnabled: true,
  previewImageUrl: null,
  hasPreviewImage: true,
  previewSiteName: "Example",
  previewFetchedAt: "2026-09-01T09:00:00.000Z",
  isGlobal: true,
  sortOrder: 0,
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T09:00:00.000Z",
  subgroupIds: [],
};

describe("public resource routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.prisma.user.findUnique.mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.org",
      role: "TEACHER",
      isActive: true,
    });
  });

  it("returns resources visible to the authenticated user", async () => {
    resourceOperations.listResourcesForUser.mockResolvedValue([visibleResource]);

    const response = await request(createApp()).get("/api/resources").set("Cookie", teacherCookie);

    expect(response).toMatchObject({ status: 200, body: [visibleResource] });
    expect(response.body[0]).toHaveProperty("hasPreviewImage", true);
    expect(resourceOperations.listResourcesForUser).toHaveBeenCalledWith("teacher-1");
  });

  it("returns 401 when requesting resources without authentication", async () => {
    expect((await request(createApp()).get("/api/resources")).status).toBe(401);
    expect(resourceOperations.listResourcesForUser).not.toHaveBeenCalled();
  });
});
