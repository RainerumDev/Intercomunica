import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config, adminEmails } from "../config.js";
import { prisma } from "../db.js";

export const SESSION_COOKIE = "intercomunica_session";

export interface SessionUser {
  id: string;
  email: string;
  role: "ADMIN" | "TEACHER";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function signSession(user: SessionUser): string {
  return jwt.sign(user, config().JWT_SECRET, { expiresIn: "7d" });
}

export function setSessionCookie(res: Response, user: SessionUser): void {
  res.cookie(SESSION_COOKIE, signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: config().NODE_ENV === "production",
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE);
}

export function verifySession(token: string): SessionUser | null {
  try {
    const payload = jwt.verify(token, config().JWT_SECRET) as jwt.JwtPayload;
    if (typeof payload.id !== "string" || typeof payload.email !== "string") return null;
    return {
      id: payload.id,
      email: payload.email,
      role: payload.role === "ADMIN" ? "ADMIN" : "TEACHER",
    };
  } catch {
    return null;
  }
}

/** Attach req.user when a valid session cookie is present. */
export function sessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") {
    const user = verifySession(token);
    if (user) req.user = user;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Autenticazione richiesta" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Autenticazione richiesta" });
    return;
  }
  if (req.user.role !== "ADMIN") {
    res.status(403).json({ error: "Riservato agli amministratori" });
    return;
  }
  next();
}

/** Role for an email: ADMIN_EMAILS env wins, else keep existing DB role. */
export function roleForEmail(email: string, existingRole?: "ADMIN" | "TEACHER"): "ADMIN" | "TEACHER" {
  if (adminEmails().has(email.toLowerCase())) return "ADMIN";
  return existingRole ?? "TEACHER";
}

/** Upsert app user at login time. */
export async function upsertLoginUser(profile: {
  email: string;
  name?: string;
  picture?: string;
}): Promise<SessionUser> {
  const email = profile.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  const role = roleForEmail(email, existing?.role);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: profile.name, picture: profile.picture, role },
    update: { name: profile.name ?? undefined, picture: profile.picture ?? undefined, role },
  });
  return { id: user.id, email: user.email, role: user.role };
}
