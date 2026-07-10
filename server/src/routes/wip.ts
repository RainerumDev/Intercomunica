import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireAdmin } from "../auth/session.js";
import { h, parseBody } from "./helpers.js";

/**
 * PRD §7 — Sezioni Future (WIP). Predisposizione: database models exist,
 * endpoints are wired but intentionally minimal.
 */
export const wipRouter = Router();

// --- WIP A: anagrafica studenti ---------------------------------------------

wipRouter.get(
  "/students",
  requireAdmin,
  h(async (_req, res) => {
    const students = await prisma.student.findMany({
      include: { guardians: true },
      orderBy: [{ className: "asc" }, { lastName: "asc" }],
    });
    res.json(students);
  })
);

// --- WIP B: compleanni / onomastici + digital signage ------------------------

async function todaysCelebrations() {
  const today = new Date();
  const mmdd = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [users, students] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, birthDate: { not: null } } }),
    prisma.student.findMany({ where: { birthDate: { not: null } } }),
  ]);
  const isToday = (d: Date | null) =>
    d !== null &&
    `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` === mmdd;
  return [
    ...users
      .filter((u) => isToday(u.birthDate))
      .map((u) => ({ name: u.name ?? u.email, kind: "DOCENTE" as const, className: null })),
    ...students
      .filter((s) => isToday(s.birthDate))
      .map((s) => ({ name: `${s.firstName} ${s.lastName}`, kind: "STUDENTE" as const, className: s.className })),
  ];
}

/** Bacheca widget: today's birthdays. */
wipRouter.get(
  "/birthdays/today",
  requireAuth,
  h(async (_req, res) => {
    res.json(await todaysCelebrations());
  })
);

/** Digital-signage RSS feed (protected by static token, for signage software). */
wipRouter.get(
  "/birthdays/rss",
  h(async (req, res) => {
    const token = req.query.token;
    const expected = process.env.SIGNAGE_TOKEN;
    if (!expected || token !== expected) {
      res.status(401).send("token non valido");
      return;
    }
    const items = await todaysCelebrations();
    const now = new Date().toUTCString();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Compleanni di oggi — Intercomunica Rainerum</title>
<link>https://rainerum.it</link>
<description>Festeggiati del giorno</description>
<lastBuildDate>${now}</lastBuildDate>
${items
  .map(
    (i) =>
      `<item><title>${i.name} (${i.kind}${i.className ? ` ${i.className}` : ""})</title><pubDate>${now}</pubDate></item>`
  )
  .join("\n")}
</channel></rss>`;
    res.type("application/rss+xml").send(xml);
  })
);

// --- WIP C: import orario scolastico -----------------------------------------

const timetableSchema = z.object({
  source: z.string().trim().min(1).max(60),
  payload: z.unknown(),
});

/** Webhook/endpoint POST for third-party timetable software (Untis, EDT, …). */
wipRouter.post(
  "/timetable/import",
  requireAdmin,
  h(async (req, res) => {
    const body = parseBody(timetableSchema, req, res);
    if (!body) return;
    const record = await prisma.timetableImport.create({
      data: {
        source: body.source,
        payload: body.payload as object,
        status: "RECEIVED",
        message: "Import registrato. Conversione in eventi ricorrenti: funzionalità futura (WIP C).",
      },
    });
    res.status(202).json({ id: record.id, status: record.status, message: record.message });
  })
);
