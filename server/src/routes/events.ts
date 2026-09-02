import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../auth/session.js";
import {
  createEvent,
  updateEvent,
  deleteEventEverywhere,
  ReadOnlyGeneralCalendarError,
} from "../services/eventService.js";
import { isWritableCalendarAccessRole } from "../google/calendar.js";
import { h, parseBody } from "./helpers.js";

export const eventsRouter = Router();

export function calendarCapabilities(config: {
  generalCalendarId: string | null;
  generalCalendarAccessRole: string | null;
}) {
  return {
    generalCalendarConfigured: Boolean(config.generalCalendarId),
    generalCalendarWritable:
      Boolean(config.generalCalendarId) &&
      isWritableCalendarAccessRole(config.generalCalendarAccessRole),
  };
}

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

export function serializeEvent(e: {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  isGlobal: boolean;
  bachecaOnly: boolean;
  generalGoogleEventId: string | null;
  tags: { tag: { id: string; name: string; color: string | null } }[];
  subgroups: { subgroupId: string }[];
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
    hasGeneralCalendarEvent: Boolean(e.generalGoogleEventId),
    tags: e.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    subgroupIds: e.subgroups.map((s) => s.subgroupId),
  };
}

const includeRelations = {
  tags: { include: { tag: true } },
  subgroups: true,
} as const;

eventsRouter.get(
  "/capabilities",
  requireAuth,
  h(async (_req, res) => {
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 },
      select: { generalCalendarId: true, generalCalendarAccessRole: true },
    });
    res.json(
      calendarCapabilities({
        generalCalendarId: config?.generalCalendarId ?? null,
        generalCalendarAccessRole: config?.generalCalendarAccessRole ?? null,
      })
    );
  })
);

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
    res.json(events.map(serializeEvent));
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
    res.status(201).json(serializeEvent(full));
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
    res.json(serializeEvent(full));
  })
);

eventsRouter.delete(
  "/:id",
  requireAdmin,
  h(async (req, res) => {
    try {
      await deleteEventEverywhere(req.params.id);
    } catch (error) {
      if (error instanceof ReadOnlyGeneralCalendarError) {
        res.status(409).json({
          error: error.message,
          code: "GENERAL_CALENDAR_READ_ONLY",
        });
        return;
      }
      throw error;
    }
    res.json({ ok: true });
  })
);
