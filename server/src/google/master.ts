import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "../db.js";
import { decrypt } from "../crypto.js";
import { oauthClient, MASTER_CALLBACK_PATH } from "./oauth.js";

/** OAuth client authorized as the master account. Throws if not connected. */
export async function masterAuth(): Promise<OAuth2Client> {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.masterRefreshTokenEnc) {
    throw new MasterNotConnectedError();
  }
  const client = oauthClient(MASTER_CALLBACK_PATH);
  client.setCredentials({ refresh_token: decrypt(cfg.masterRefreshTokenEnc) });
  return client;
}

export class MasterNotConnectedError extends Error {
  constructor() {
    super("Account master non collegato. Completare la configurazione iniziale.");
    this.name = "MasterNotConnectedError";
  }
}

export async function calendarApi() {
  return google.calendar({ version: "v3", auth: await masterAuth() });
}

export async function directoryApi() {
  return google.admin({ version: "directory_v1", auth: await masterAuth() });
}

export async function cloudIdentityApi() {
  return google.cloudidentity({ version: "v1", auth: await masterAuth() });
}

export async function gmailApi() {
  return google.gmail({ version: "v1", auth: await masterAuth() });
}
