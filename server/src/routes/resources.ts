import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth/session.js";
import { fetchLinkPreview } from "../services/linkPreview.js";
import {
  createResource,
  deleteResource,
  listAdminResources,
  reorderResources,
  resourceInputSchema,
  resourceOrderSchema,
  updateResource,
} from "../services/sharedResourceService.js";
import { h, parseBody } from "./helpers.js";

const previewSchema = z.object({
  url: z.string().trim().url().refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Preview URL must use HTTP or HTTPS"),
});

export const resourcesRouter = Router();

resourcesRouter.use(requireAdmin);

resourcesRouter.get(
  "/",
  h(async (_req, res) => {
    res.json(await listAdminResources());
  })
);

resourcesRouter.post(
  "/preview",
  h(async (req, res) => {
    const body = parseBody(previewSchema, req, res);
    if (!body) return;

    try {
      res.json(await fetchLinkPreview(body.url));
    } catch {
      res.status(422).json({ error: "Anteprima non disponibile" });
    }
  })
);

resourcesRouter.post(
  "/",
  h(async (req, res) => {
    const body = parseBody(resourceInputSchema, req, res);
    if (!body) return;
    res.status(201).json(await createResource(body));
  })
);

resourcesRouter.put(
  "/order",
  h(async (req, res) => {
    const body = parseBody(resourceOrderSchema, req, res);
    if (!body) return;
    res.json(await reorderResources(body.resourceIds));
  })
);

resourcesRouter.put(
  "/:id",
  h(async (req, res) => {
    const body = parseBody(resourceInputSchema, req, res);
    if (!body) return;
    res.json(await updateResource(req.params.id, body));
  })
);

resourcesRouter.delete(
  "/:id",
  h(async (req, res) => {
    await deleteResource(req.params.id);
    res.json({ ok: true });
  })
);
