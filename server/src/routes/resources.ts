import { Router, type Response } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth/session.js";
import { fetchLinkPreview } from "../services/linkPreview.js";
import {
  createResource,
  deleteResource,
  InvalidResourceOrderError,
  listAdminResources,
  reorderResources,
  ResourceNotFoundError,
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

function handleResourceError(error: unknown, res: Response): void {
  if (error instanceof ResourceNotFoundError) {
    res.status(404).json({ error: "Risorsa non trovata" });
    return;
  }
  if (error instanceof InvalidResourceOrderError) {
    res.status(409).json({ error: "Ordine delle risorse non valido" });
    return;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  ) {
    res.status(409).json({
      error: "La raccolta delle risorse è cambiata durante l’operazione",
      code: "RESOURCE_COLLECTION_CONFLICT",
    });
    return;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2003"
  ) {
    res.status(409).json({
      error: "Uno o più sottogruppi selezionati non esistono più",
      code: "RESOURCE_AUDIENCE_CONFLICT",
    });
    return;
  }
  throw error;
}

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
      const preview = await fetchLinkPreview(body.url);
      res.json({ ...preview, imageUrl: null });
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
    try {
      res.status(201).json(await createResource(body));
    } catch (error) {
      handleResourceError(error, res);
    }
  })
);

resourcesRouter.put(
  "/order",
  h(async (req, res) => {
    const body = parseBody(resourceOrderSchema, req, res);
    if (!body) return;
    try {
      res.json(await reorderResources(body.resourceIds));
    } catch (error) {
      handleResourceError(error, res);
    }
  })
);

resourcesRouter.put(
  "/:id",
  h(async (req, res) => {
    const body = parseBody(resourceInputSchema, req, res);
    if (!body) return;
    try {
      res.json(await updateResource(req.params.id, body));
    } catch (error) {
      handleResourceError(error, res);
    }
  })
);

resourcesRouter.delete(
  "/:id",
  h(async (req, res) => {
    try {
      await deleteResource(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      handleResourceError(error, res);
    }
  })
);
