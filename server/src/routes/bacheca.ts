import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { bachecaForUser } from "../services/bachecaService.js";
import { h } from "./helpers.js";

export const bachecaRouter = Router();

/** Flusso 5 — personalized homepage sections (max 3 upcoming events per TAG). */
bachecaRouter.get(
  "/",
  requireAuth,
  h(async (req, res) => {
    res.json(await bachecaForUser(req.user!.id));
  })
);
