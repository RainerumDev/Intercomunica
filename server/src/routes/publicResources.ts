import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import {
  getResourceImageForUser,
  listResourcesForUser,
  ResourceNotFoundError,
  sanitizeResourceRecord,
} from "../services/sharedResourceService.js";
import { h } from "./helpers.js";

export const publicResourcesRouter = Router();

publicResourcesRouter.get(
  "/:id/preview-image",
  requireAuth,
  h(async (req, res) => {
    try {
      const image = await getResourceImageForUser(req.user!.id, req.params.id);
      const data = Buffer.from(image.data);
      res.set({
        "Content-Type": image.mimeType,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, max-age=3600",
      });
      res.send(data);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        res.status(404).json({ error: "Risorsa non trovata" });
        return;
      }
      throw error;
    }
  })
);

publicResourcesRouter.get(
  "/",
  requireAuth,
  h(async (req, res) => {
    res.json((await listResourcesForUser(req.user!.id)).map(sanitizeResourceRecord));
  })
);
