import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resourceOperations = vi.hoisted(() => ({
  createResource: vi.fn(),
  deleteResource: vi.fn(),
  listAdminResources: vi.fn(),
  reorderResources: vi.fn(),
  updateResource: vi.fn(),
}));

const previewOperations = vi.hoisted(() => ({
  fetchLinkPreview: vi.fn(),
}));

vi.mock("../services/sharedResourceService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/sharedResourceService.js")>();
  return { ...actual, ...resourceOperations };
});

vi.mock("../services/linkPreview.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/linkPreview.js")>();
  return { ...actual, ...previewOperations };
});

import { SESSION_COOKIE, signSession } from "../auth/session.js";
import { createApp } from "../index.js";
import {
  InvalidResourceOrderError,
  ResourceNotFoundError,
  type ResourceRecord,
  type SharedResourceInput,
} from "../services/sharedResourceService.js";

const resourceInput: SharedResourceInput = {
  url: "https://example.org/guide",
  title: "Guide",
  description: "A useful guide",
  previewEnabled: true,
  previewImageUrl: null,
  previewSiteName: null,
  isGlobal: false,
  subgroupIds: ["subgroup-1"],
};

function resource(id: string, sortOrder: number): ResourceRecord {
  return {
    id,
    ...resourceInput,
    sortOrder,
    previewFetchedAt: new Date("2026-09-01T09:00:00.000Z"),
    createdAt: new Date("2026-09-01T08:00:00.000Z"),
    updatedAt: new Date("2026-09-01T09:00:00.000Z"),
  };
}

function sessionCookie(role: "ADMIN" | "TEACHER"): string {
  const token = signSession({
    id: `${role.toLowerCase()}-1`,
    email: `${role.toLowerCase()}@example.org`,
    role,
  });
  return `${SESSION_COOKIE}=${token}`;
}

const adminCookie = () => sessionCookie("ADMIN");
const teacherCookie = () => sessionCookie("TEACHER");

describe("admin resource routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the request has no signed session", async () => {
    const response = await request(createApp()).get("/api/admin/resources");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Autenticazione richiesta" });
    expect(resourceOperations.listAdminResources).not.toHaveBeenCalled();
  });

  it("returns 403 when a teacher requests the admin resource collection", async () => {
    const response = await request(createApp())
      .get("/api/admin/resources")
      .set("Cookie", teacherCookie());

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Riservato agli amministratori" });
    expect(resourceOperations.listAdminResources).not.toHaveBeenCalled();
  });

  it("returns the ordered admin resource collection", async () => {
    const ordered = [resource("resource-2", 0), resource("resource-1", 1)];
    resourceOperations.listAdminResources.mockResolvedValue(ordered);

    const response = await request(createApp())
      .get("/api/admin/resources")
      .set("Cookie", adminCookie());

    expect(response.status).toBe(200);
    expect(response.body.map((item: ResourceRecord) => item.id)).toEqual(["resource-2", "resource-1"]);
  });

  it("rejects an invalid create body before reaching persistence", async () => {
    const response = await request(createApp())
      .post("/api/admin/resources")
      .set("Cookie", adminCookie())
      .send({ ...resourceInput, title: "", subgroupIds: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Dati non validi");
    expect(resourceOperations.createResource).not.toHaveBeenCalled();
  });

  it("creates a valid resource and returns it with status 201", async () => {
    const created = resource("resource-new", 2);
    resourceOperations.createResource.mockResolvedValue(created);

    const response = await request(createApp())
      .post("/api/admin/resources")
      .set("Cookie", adminCookie())
      .send({ ...resourceInput, ignored: "not part of the schema" });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe("resource-new");
    expect(resourceOperations.createResource).toHaveBeenCalledWith(resourceInput);
  });

  it("returns a bounded preview error without creating a resource", async () => {
    const privateFailure = "private upstream details ".repeat(100);
    previewOperations.fetchLinkPreview.mockRejectedValue(new Error(privateFailure));

    const response = await request(createApp())
      .post("/api/admin/resources/preview")
      .set("Cookie", adminCookie())
      .send({
        url: "https://example.org/guide",
        subgroupIds: ["must-not-reach-preview"],
        previewImageUrl: "https://attacker.example.org/image.png",
      });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: "Anteprima non disponibile" });
    expect(JSON.stringify(response.body)).not.toContain(privateFailure);
    expect(JSON.stringify(response.body).length).toBeLessThan(200);
    expect(resourceOperations.createResource).not.toHaveBeenCalled();
  });

  it("rejects a malformed preview URL as invalid request data", async () => {
    const response = await request(createApp())
      .post("/api/admin/resources/preview")
      .set("Cookie", adminCookie())
      .send({ url: "not a URL" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Dati non validi");
    expect(previewOperations.fetchLinkPreview).not.toHaveBeenCalled();
  });

  it("updates a resource from validated input and returns the updated resource", async () => {
    const updated = { ...resource("resource-1", 0), title: "Updated guide" };
    resourceOperations.updateResource.mockResolvedValue(updated);

    const response = await request(createApp())
      .put("/api/admin/resources/resource-1")
      .set("Cookie", adminCookie())
      .send({ ...resourceInput, title: "Updated guide", ignored: true });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("Updated guide");
    expect(resourceOperations.updateResource).toHaveBeenCalledWith("resource-1", {
      ...resourceInput,
      title: "Updated guide",
    });
  });

  it("returns 404 when updating a missing resource", async () => {
    resourceOperations.updateResource.mockRejectedValue(
      new ResourceNotFoundError("resource-absent")
    );

    const response = await request(createApp())
      .put("/api/admin/resources/resource-absent")
      .set("Cookie", adminCookie())
      .send(resourceInput);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Risorsa non trovata" });
  });

  it("deletes a resource and returns an acknowledgement", async () => {
    resourceOperations.deleteResource.mockResolvedValue(undefined);

    const response = await request(createApp())
      .delete("/api/admin/resources/resource-1")
      .set("Cookie", adminCookie());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(resourceOperations.deleteResource).toHaveBeenCalledWith("resource-1");
  });

  it("returns 404 when deleting a missing resource", async () => {
    resourceOperations.deleteResource.mockRejectedValue(
      new ResourceNotFoundError("resource-absent")
    );

    const response = await request(createApp())
      .delete("/api/admin/resources/resource-absent")
      .set("Cookie", adminCookie());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Risorsa non trovata" });
  });

  it("persists a validated complete order and returns ordered resources", async () => {
    const ordered = [resource("resource-2", 0), resource("resource-1", 1)];
    resourceOperations.reorderResources.mockResolvedValue(ordered);

    const response = await request(createApp())
      .put("/api/admin/resources/order")
      .set("Cookie", adminCookie())
      .send({ resourceIds: ["resource-2", "resource-1"], ignored: true });

    expect(response.status).toBe(200);
    expect(response.body.map((item: ResourceRecord) => item.id)).toEqual(["resource-2", "resource-1"]);
    expect(resourceOperations.reorderResources).toHaveBeenCalledWith(["resource-2", "resource-1"]);
  });

  it("returns 409 when the submitted order is stale or incomplete", async () => {
    resourceOperations.reorderResources.mockRejectedValue(
      new InvalidResourceOrderError()
    );

    const response = await request(createApp())
      .put("/api/admin/resources/order")
      .set("Cookie", adminCookie())
      .send({ resourceIds: ["resource-1"] });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Ordine delle risorse non valido" });
  });
});
