import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { listResourcesForUser } from "../services/sharedResourceService.js";
import { h } from "./helpers.js";

export const publicResourcesRouter = Router();

publicResourcesRouter.get(
  "/",
  requireAuth,
  h(async (req, res) => {
    res.json(await listResourcesForUser(req.user!.id));
  })
);
