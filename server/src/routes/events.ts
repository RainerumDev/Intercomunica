import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../auth/session.js";
import { createEvent, updateEvent, deleteEventEverywhere } from "../services/eventService.js";
import { h, parseBody } from "./helpers.js";

export const eventsRouter = Router();

const eventSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(5000).optional().nullable(),
    location: z.string().max(300).optional().nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    allDay: z.boolean().default(false),
    isGlobal: z.boolean().default(false),
    bachecaOnly: z.boolean().default(false),
    subgroupIds: z.array(z.string()).default([]),
    tagNames: z.array(z.string().trim().min(1).max(60)).default([]),
  })
  .refine((e) => e.endsAt >= e.startsAt, { message: "endsAt precedente a startsAt" })
  .refine((e) => !e.allDay || e.endsAt > e.startsAt, {
    message: "La data di fine di un evento giornaliero deve essere successiva all'inizio",
  })
  .refine((e) => e.isGlobal || e.bachecaOnly || e.subgroupIds.length > 0, {
    message: "Selezionare almeno un sottogruppo (o attivare 'Visibile a tutti' / 'Solo bacheca')",
  });

function serialize(e: {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  isGlobal: boolean;
  bachecaOnly: boolean;
  tags: { tag: { id: string; name: string; color: string | null } }[];
  subgroups: { subgroupId: string }[];
  _count?: { instances: number };
}) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay,
    isGlobal: e.isGlobal,
    bachecaOnly: e.bachecaOnly,
    tags: e.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    subgroupIds: e.subgroups.map((s) => s.subgroupId),
    instanceCount: e._count?.instances,
  };
}

const includeRelations = {
  tags: { include: { tag: true } },
  subgroups: true,
  _count: { select: { instances: true } },
} as const;

/** Admin calendar view: events in a date range (?from=&to=). */
eventsRouter.get(
  "/",
  requireAuth,
  h(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400e3);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 90 * 86400e3);
    const events = await prisma.event.findMany({
      where: { startsAt: { lte: to }, endsAt: { gte: from } },
      include: includeRelations,
      orderBy: { startsAt: "asc" },
    });
    res.json(events.map(serialize));
  })
);

eventsRouter.post(
  "/",
  requireAdmin,
  h(async (req, res) => {
    const body = parseBody(eventSchema, req, res);
    if (!body) return;
    const event = await createEvent(body, req.user!.id);
    const full = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: includeRelations,
    });
    res.status(201).json(serialize(full));
  })
);

eventsRouter.put(
  "/:id",
  requireAdmin,
  h(async (req, res) => {
    const body = parseBody(eventSchema, req, res);
    if (!body) return;
    await updateEvent(req.params.id, body);
    const full = await prisma.event.findUniqueOrThrow({
      where: { id: req.params.id },
      include: includeRelations,
    });
    res.json(serialize(full));
  })
);

eventsRouter.delete(
  "/:id",
  requireAdmin,
  h(async (req, res) => {
    await deleteEventEverywhere(req.params.id);
    res.json({ ok: true });
  })
);
