import { createHash } from "node:crypto";
import { Router } from "express";
import { canAccessApp, requireAuth } from "../auth/session.js";
import { config, usesPersonalCalendar } from "../config.js";
import { prisma } from "../db.js";
import { hashFeedToken } from "../services/calendarFeedCredential.js";
import {
  calendarLinksForUser,
  rotateUserFeedCredential,
} from "../services/calendarLinks.js";
import { loadPersonalCalendar } from "../services/personalCalendarFeed.js";
import { h } from "./helpers.js";

export const calendarLinksRouter = Router();

calendarLinksRouter.get(
  "/",
  requireAuth,
  h(async (req, res) => {
    res.json(await calendarLinksForUser(req.user!.id));
  })
);

calendarLinksRouter.post(
  "/rotate",
  requireAuth,
  h(async (req, res) => {
    res.json(await rotateUserFeedCredential(req.user!.id));
  })
);

export const calendarFeedRouter = Router();

function reportFeedStatus(status: 200 | 304 | 404 | 410 | 503): void {
  console.info(`calendar_feed status=${status}`);
}

calendarFeedRouter.get(
  "/:token.ics",
  h(async (req, res) => {
    try {
      const token = req.params.token;
      const user = await prisma.user.findUnique({
        where: { calendarFeedTokenHash: hashFeedToken(token) },
        select: { id: true, email: true, isActive: true },
      });
      if (!user) {
        reportFeedStatus(404);
        res.status(404).send("Calendario non disponibile");
        return;
      }
      if (!canAccessApp(user.email, user.isActive) || !usesPersonalCalendar(user.email)) {
        reportFeedStatus(410);
        res.status(410).send("Calendario non disponibile");
        return;
      }

      const sourceUrl = new URL(`/calendar/feed/${token}.ics`, config().BASE_URL).toString();
      const body = await loadPersonalCalendar(user.id, sourceUrl);
      const etag = `"${createHash("sha256").update(body, "utf8").digest("base64url")}"`;
      res.set({
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="intercomunica.ics"',
        "Cache-Control": "private, no-cache",
        ETag: etag,
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { calendarFeedLastFetchedAt: new Date() },
      });
      if (req.header("if-none-match") === etag) {
        reportFeedStatus(304);
        res.status(304).end();
        return;
      }

      reportFeedStatus(200);
      res.send(body);
    } catch {
      reportFeedStatus(503);
      res.status(503).send("Calendario temporaneamente non disponibile");
    }
  })
);
