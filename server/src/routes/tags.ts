import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/session.js";
import { h } from "./helpers.js";

export const tagsRouter = Router();

tagsRouter.get(
  "/",
  requireAuth,
  h(async (_req, res) => {
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    res.json(tags);
  })
);
