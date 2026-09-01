import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const transaction = {
    sharedResource: { findFirst: vi.fn() },
    subgroup: { delete: vi.fn() },
  };
  return {
    transaction,
    prisma: {
      subgroup: {
        create: vi.fn(),
        delete: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      subgroupMember: {
        deleteMany: vi.fn(),
        upsert: vi.fn(),
      },
      $transaction: vi.fn(async (work: (client: typeof transaction) => Promise<unknown>) =>
        work(transaction)
      ),
    },
  };
});

vi.mock("../db.js", () => ({ prisma: database.prisma }));

import { SESSION_COOKIE, signSession } from "../auth/session.js";
import { createApp } from "../index.js";

function adminCookie(): string {
  return `${SESSION_COOKIE}=${signSession({
    id: "admin-1",
    email: "admin@example.org",
    role: "ADMIN",
  })}`;
}

describe("subgroup deletion resource audience invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns typed 409 and preserves a subgroup that is a resource's sole audience", async () => {
    database.transaction.sharedResource.findFirst.mockResolvedValue({ id: "resource-1" });

    const response = await request(createApp())
      .delete("/api/subgroups/group-1")
      .set("Cookie", adminCookie());

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "Il sottogruppo è l’unico destinatario di almeno una risorsa condivisa",
      code: "SUBGROUP_RESOURCE_AUDIENCE_CONFLICT",
    });
    expect(database.transaction.subgroup.delete).not.toHaveBeenCalled();
  });

  it("deletes a subgroup when every targeted resource has another audience", async () => {
    database.transaction.sharedResource.findFirst.mockResolvedValue(null);
    database.transaction.subgroup.delete.mockResolvedValue({ id: "group-1" });

    const response = await request(createApp())
      .delete("/api/subgroups/group-1")
      .set("Cookie", adminCookie());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(database.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" }
    );
    expect(database.transaction.sharedResource.findFirst).toHaveBeenCalledWith({
      where: {
        isGlobal: false,
        AND: [
          { subgroups: { some: { subgroupId: "group-1" } } },
          { subgroups: { none: { subgroupId: { not: "group-1" } } } },
        ],
      },
      select: { id: true },
    });
    expect(database.transaction.subgroup.delete).toHaveBeenCalledWith({
      where: { id: "group-1" },
    });
  });
});
