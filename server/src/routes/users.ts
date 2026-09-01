import { Router } from "express";
import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "../auth/session.js";
import { calendarExcludedEmails } from "../config.js";
import { h } from "./helpers.js";

export const usersRouter = Router();

export function buildDirectoryWhere(
  q: string,
  excludedEmails: Set<string>
): Prisma.UserWhereInput {
  const excluded = [...excludedEmails];
  const where: Prisma.UserWhereInput = {
    isActive: true,
    ...(excluded.length > 0 ? { email: { notIn: excluded } } : {}),
  };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { subgroups: { some: { subgroup: { name: { contains: q, mode: "insensitive" } } } } },
    ];
  }
  return where;
}

type DirectoryUser = Prisma.UserGetPayload<{
  include: { subgroups: { include: { subgroup: true } } };
}>;

export function serializeDirectoryUser(user: DirectoryUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subgroups: user.subgroups.map((membership) => ({
      id: membership.subgroup.id,
      name: membership.subgroup.name,
      folder: membership.subgroup.folder,
      color: membership.subgroup.color,
    })),
  };
}

/**
 * Flusso 2.2 — anagrafica: full member list with subgroup memberships.
 * Search (?q=) matches name, email or subgroup name.
 */
usersRouter.get(
  "/",
  requireAuth,
  h(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where = buildDirectoryWhere(q, calendarExcludedEmails());
    const users = await prisma.user.findMany({
      where,
      include: { subgroups: { include: { subgroup: true } } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    res.json(users.map(serializeDirectoryUser));
  })
);
