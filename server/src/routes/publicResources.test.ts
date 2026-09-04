import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resourceOperations = vi.hoisted(() => ({
  getResourceImageForUser: vi.fn(),
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
import { ResourceNotFoundError } from "../services/sharedResourceService.js";

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
    resourceOperations.listResourcesForUser.mockResolvedValue([{
      ...visibleResource,
      previewImageUrl: "https://legacy.example.org/public.png",
    }]);

    const response = await request(createApp()).get("/api/resources").set("Cookie", teacherCookie);

    expect(response).toMatchObject({
      status: 200,
      body: [{ ...visibleResource, previewImageUrl: null }],
    });
    expect(response.body[0]).toHaveProperty("hasPreviewImage", true);
    expect(resourceOperations.listResourcesForUser).toHaveBeenCalledWith("teacher-1");
  });

  it("returns 401 when requesting resources without authentication", async () => {
    expect((await request(createApp()).get("/api/resources")).status).toBe(401);
    expect(resourceOperations.listResourcesForUser).not.toHaveBeenCalled();
  });

  it("serves exact cached preview bytes with private cache headers to a visible user", async () => {
    const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    resourceOperations.getResourceImageForUser.mockResolvedValue({
      data: new Uint8Array(pngBytes),
      mimeType: "image/png",
    });

    const response = await request(createApp())
      .get("/api/resources/resource-1/preview-image")
      .set("Cookie", teacherCookie);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^image\/png/);
    expect(response.headers["content-length"]).toBe(String(pngBytes.byteLength));
    expect(response.headers["cache-control"]).toBe("private, max-age=3600");
    expect(Buffer.compare(response.body, pngBytes)).toBe(0);
  });

  it.each(["invisible", "missing", "image-less"])(
    "returns the same 404 response when a resource is %s",
    async () => {
      resourceOperations.getResourceImageForUser.mockRejectedValue(
        new ResourceNotFoundError("resource-1")
      );

      const response = await request(createApp())
        .get("/api/resources/resource-1/preview-image")
        .set("Cookie", teacherCookie);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Risorsa non trovata" });
    }
  );

  it("requires authentication before serving preview image bytes", async () => {
    const response = await request(createApp()).get("/api/resources/resource-1/preview-image");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Autenticazione richiesta" });
    expect(resourceOperations.getResourceImageForUser).not.toHaveBeenCalled();
  });
});
