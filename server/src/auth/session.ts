import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config, adminEmails, isAccessBypassEmail } from "../config.js";
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

export function canAccessApp(email: string, isActive: boolean | undefined): boolean {
  return isAccessBypassEmail(email) || isActive === true;
}

/** Attach req.user when the signed session still belongs to an authorized user. */
export async function sessionMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") {
    const session = verifySession(token);
    if (session) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: session.id },
          select: { id: true, email: true, role: true, isActive: true },
        });
        if (user && canAccessApp(user.email, user.isActive)) {
          req.user = { id: user.id, email: user.email, role: user.role };
        } else {
          clearSessionCookie(res);
        }
      } catch (err) {
        next(err);
        return;
      }
    }
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
}): Promise<SessionUser | null> {
  const email = profile.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!canAccessApp(email, existing?.isActive)) return null;
  const role = roleForEmail(email, existing?.role);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: profile.name, picture: profile.picture, role },
    update: { name: profile.name ?? undefined, picture: profile.picture ?? undefined, role },
  });
  return { id: user.id, email: user.email, role: user.role };
}
