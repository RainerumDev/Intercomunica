import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { encrypt } from "../crypto.js";
import { masterAuthUrl, exchangeCode, verifyState, MASTER_CALLBACK_PATH } from "../google/oauth.js";
import { listGroups } from "../google/directory.js";
import { requireAdmin } from "../auth/session.js";
import { runFullSync } from "../services/syncService.js";
import { h, parseBody } from "./helpers.js";

export const adminRouter = Router();

/** Current configuration status (never exposes the token). */
adminRouter.get(
  "/config",
  requireAdmin,
  h(async (_req, res) => {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
    res.json({
      masterConnected: Boolean(cfg?.masterRefreshTokenEnc),
      masterEmail: cfg?.masterEmail ?? null,
      mainGroupEmail: cfg?.mainGroupEmail ?? null,
    });
  })
);

/** Flusso 1.1 — start OAuth offline flow for the master account. */
adminRouter.get("/master/connect", requireAdmin, (_req, res) => {
  res.redirect(masterAuthUrl());
});

/**
 * Master OAuth callback. Reached via Google redirect (top-level GET, so the
 * sameSite=lax session cookie is sent): require an ADMIN session in addition
 * to the signed state.
 */
adminRouter.get(
  "/master/callback",
  h(async (req, res) => {
    if (req.user?.role !== "ADMIN") {
      res.redirect(`${config().WEB_URL}/login?error=oauth`);
      return;
    }
    const { code, state, error } = req.query;
    if (error || typeof code !== "string" || typeof state !== "string" || !verifyState(state, "master")) {
      res.redirect(`${config().WEB_URL}/admin/settings?error=oauth`);
      return;
    }
    const { profile, refreshToken } = await exchangeCode(MASTER_CALLBACK_PATH, code);
    if (!refreshToken) {
      res.redirect(`${config().WEB_URL}/admin/settings?error=no_refresh_token`);
      return;
    }
    await prisma.appConfig.upsert({
      where: { id: 1 },
      create: { id: 1, masterEmail: profile.email, masterRefreshTokenEnc: encrypt(refreshToken) },
      update: { masterEmail: profile.email, masterRefreshTokenEnc: encrypt(refreshToken) },
    });
    res.redirect(`${config().WEB_URL}/admin/settings?connected=1`);
  })
);

/** List domain groups so the admin can pick the main one (Flusso 1.2). */
adminRouter.get(
  "/groups",
  requireAdmin,
  h(async (_req, res) => {
    res.json(await listGroups());
  })
);

const selectGroupSchema = z.object({ groupEmail: z.string().email() });

/** Select the main Google Group. */
adminRouter.post(
  "/group",
  requireAdmin,
  h(async (req, res) => {
    const body = parseBody(selectGroupSchema, req, res);
    if (!body) return;
    await prisma.appConfig.upsert({
      where: { id: 1 },
      create: { id: 1, mainGroupEmail: body.groupEmail.toLowerCase() },
      update: { mainGroupEmail: body.groupEmail.toLowerCase() },
    });
    res.json({ ok: true });
  })
);

/** Flusso 1.3 + 1.4 — full sync ("Sincronizza / Refresh"). */
adminRouter.post(
  "/sync",
  requireAdmin,
  h(async (_req, res) => {
    const result = await runFullSync();
    res.json(result);
  })
);

/** Sync history. */
adminRouter.get(
  "/synclogs",
  requireAdmin,
  h(async (_req, res) => {
    const logs = await prisma.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 30 });
    res.json(logs);
  })
);
