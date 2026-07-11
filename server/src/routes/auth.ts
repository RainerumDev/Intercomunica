import { Router } from "express";
import { config } from "../config.js";
import { prisma } from "../db.js";
import {
  loginAuthUrl,
  exchangeCode,
  verifyState,
  LOGIN_CALLBACK_PATH,
} from "../google/oauth.js";
import { setSessionCookie, clearSessionCookie, upsertLoginUser, requireAuth } from "../auth/session.js";
import { h } from "./helpers.js";

export const authRouter = Router();

/** Start Google OAuth login. */
authRouter.get("/google", (_req, res) => {
  res.redirect(loginAuthUrl());
});

/** OAuth callback → session cookie → redirect to frontend. */
authRouter.get(
  "/google/callback",
  h(async (req, res) => {
    const { code, state, error } = req.query;
    if (error || typeof code !== "string" || typeof state !== "string" || !verifyState(state, "login")) {
      res.redirect(`${config().WEB_URL}/login?error=oauth`);
      return;
    }
    const { profile } = await exchangeCode(LOGIN_CALLBACK_PATH, code);
    const allowedDomain = config().ALLOWED_EMAIL_DOMAIN?.toLowerCase();
    if (allowedDomain && !profile.email.toLowerCase().endsWith(`@${allowedDomain}`)) {
      res.redirect(`${config().WEB_URL}/login?error=domain`);
      return;
    }
    const user = await upsertLoginUser(profile);
    setSessionCookie(res, user);
    res.redirect(config().WEB_URL);
  })
);

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Current session + profile. */
authRouter.get(
  "/me",
  requireAuth,
  h(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { subgroups: { include: { subgroup: true } } },
    });
    if (!user) {
      clearSessionCookie(res);
      res.status(401).json({ error: "Utente non trovato" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
      subgroups: user.subgroups.map((m) => ({ id: m.subgroup.id, name: m.subgroup.name })),
    });
  })
);
