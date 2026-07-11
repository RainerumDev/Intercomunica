import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

/** Scopes for teacher/admin login (identity only). */
export const LOGIN_SCOPES = ["openid", "email", "profile"];

/** Scopes for the master account (comunicazione@): full orchestration. */
export const MASTER_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar",
  // member listing without admin privileges (caller needs group visibility only)
  "https://www.googleapis.com/auth/cloud-identity.groups.readonly",
  // domain group listing — optional, works only with a delegated admin role
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.member.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export const LOGIN_CALLBACK_PATH = "/api/auth/google/callback";
export const MASTER_CALLBACK_PATH = "/api/admin/master/callback";

export function oauthClient(callbackPath: string): OAuth2Client {
  const c = config();
  return new google.auth.OAuth2(
    c.GOOGLE_CLIENT_ID,
    c.GOOGLE_CLIENT_SECRET,
    `${c.BASE_URL}${callbackPath}`
  );
}

/** Short-lived signed state to protect OAuth callbacks against CSRF. */
export function signState(purpose: "login" | "master"): string {
  return jwt.sign({ purpose }, config().JWT_SECRET, { expiresIn: "10m" });
}

export function verifyState(state: string, purpose: "login" | "master"): boolean {
  try {
    const payload = jwt.verify(state, config().JWT_SECRET) as jwt.JwtPayload;
    return payload.purpose === purpose;
  } catch {
    return false;
  }
}

export function loginAuthUrl(): string {
  return oauthClient(LOGIN_CALLBACK_PATH).generateAuthUrl({
    scope: LOGIN_SCOPES,
    state: signState("login"),
    // hint Google's account chooser to the school domain (server-side check enforces it)
    hd: config().ALLOWED_EMAIL_DOMAIN,
  });
}

export function masterAuthUrl(): string {
  return oauthClient(MASTER_CALLBACK_PATH).generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force refresh_token issuance
    scope: MASTER_SCOPES,
    state: signState("master"),
  });
}

export interface GoogleProfile {
  email: string;
  name?: string;
  picture?: string;
}

/** Exchange an auth code and read the ID-token profile. */
export async function exchangeCode(
  callbackPath: string,
  code: string
): Promise<{ client: OAuth2Client; profile: GoogleProfile; refreshToken?: string }> {
  const client = oauthClient(callbackPath);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  if (!tokens.id_token) throw new Error("Google non ha restituito un id_token");
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config().GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email) throw new Error("Profilo Google privo di email");
  return {
    client,
    profile: { email: payload.email, name: payload.name, picture: payload.picture },
    refreshToken: tokens.refresh_token ?? undefined,
  };
}
