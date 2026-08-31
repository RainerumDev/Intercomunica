import { Router } from "express";
import { prisma } from "../db.js";
import { syncGeneralCalendar } from "../services/generalCalendarSync.js";
import { h } from "./helpers.js";

export const googleCalendarRouter = Router();

googleCalendarRouter.post("/webhook", h(async (req, res) => {
  const channelId = req.header("x-goog-channel-id");
  const resourceId = req.header("x-goog-resource-id");
  const channelToken = req.header("x-goog-channel-token");
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (
    !cfg?.generalCalendarChannelId ||
    channelId !== cfg.generalCalendarChannelId ||
    resourceId !== cfg.generalCalendarResourceId ||
    channelToken !== cfg.generalCalendarChannelToken
  ) {
    res.status(403).json({ error: "Webhook Google non valido" });
    return;
  }
  res.status(204).end();
  void syncGeneralCalendar().catch((err) => {
    console.error("Webhook calendario generale fallito:", (err as Error).message);
  });
}));
