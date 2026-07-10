import { Router } from "express";
import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "../auth/session.js";
import { h } from "./helpers.js";

export const usersRouter = Router();

/**
 * Flusso 2.2 — anagrafica: full member list with subgroup memberships.
 * Search (?q=) matches name, email or subgroup name.
 */
usersRouter.get(
  "/",
  requireAuth,
  h(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where: Prisma.UserWhereInput = { isActive: true };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { subgroups: { some: { subgroup: { name: { contains: q, mode: "insensitive" } } } } },
      ];
    }
    const users = await prisma.user.findMany({
      where,
      include: { subgroups: { include: { subgroup: true } } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        hasCalendar: Boolean(u.calendarId),
        subgroups: u.subgroups.map((m) => ({ id: m.subgroup.id, name: m.subgroup.name })),
      }))
    );
  })
);
