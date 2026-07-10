import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireAdmin } from "../auth/session.js";
import { h, parseBody } from "./helpers.js";

export const subgroupsRouter = Router();

/** Flusso 4.1 — everyone can consult the directory of subgroups + members. */
subgroupsRouter.get(
  "/",
  requireAuth,
  h(async (_req, res) => {
    const subgroups = await prisma.subgroup.findMany({
      include: {
        members: {
          include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
        },
      },
      orderBy: { name: "asc" },
    });
    res.json(
      subgroups.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        members: s.members
          .filter((m) => m.user.isActive)
          .map((m) => ({ id: m.user.id, email: m.user.email, name: m.user.name })),
      }))
    );
  })
);

const subgroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
});

subgroupsRouter.post(
  "/",
  requireAdmin,
  h(async (req, res) => {
    const body = parseBody(subgroupSchema, req, res);
    if (!body) return;
    const created = await prisma.subgroup.create({
      data: { name: body.name, description: body.description ?? null },
    });
    res.status(201).json(created);
  })
);

subgroupsRouter.put(
  "/:id",
  requireAdmin,
  h(async (req, res) => {
    const body = parseBody(subgroupSchema, req, res);
    if (!body) return;
    const updated = await prisma.subgroup.update({
      where: { id: req.params.id },
      data: { name: body.name, description: body.description ?? null },
    });
    res.json(updated);
  })
);

subgroupsRouter.delete(
  "/:id",
  requireAdmin,
  h(async (req, res) => {
    await prisma.subgroup.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

const membershipSchema = z.object({ userId: z.string().min(1) });

/** Add a teacher to a subgroup. */
subgroupsRouter.post(
  "/:id/members",
  requireAdmin,
  h(async (req, res) => {
    const body = parseBody(membershipSchema, req, res);
    if (!body) return;
    await prisma.subgroupMember.upsert({
      where: { subgroupId_userId: { subgroupId: req.params.id, userId: body.userId } },
      create: { subgroupId: req.params.id, userId: body.userId },
      update: {},
    });
    res.status(201).json({ ok: true });
  })
);

/** Remove a teacher from a subgroup. */
subgroupsRouter.delete(
  "/:id/members/:userId",
  requireAdmin,
  h(async (req, res) => {
    await prisma.subgroupMember.deleteMany({
      where: { subgroupId: req.params.id, userId: req.params.userId },
    });
    res.json({ ok: true });
  })
);
