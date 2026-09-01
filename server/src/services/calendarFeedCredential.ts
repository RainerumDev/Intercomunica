import { createHash, randomBytes } from "node:crypto";
import { decrypt, encrypt } from "../crypto.js";

export function normalizeFeedPrefix(email: string): string {
  const localPart = email.trim().split("@", 1)[0] ?? "";
  return localPart.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createFeedCredential(
  email: string,
  random: (size: number) => Buffer = randomBytes
): { token: string; tokenHash: string; tokenEnc: string; issuedAt: Date } {
  const token = `${normalizeFeedPrefix(email)}-${random(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashFeedToken(token),
    tokenEnc: encrypt(token),
    issuedAt: new Date(),
  };
}

export function decryptFeedToken(tokenEnc: string): string {
  return decrypt(tokenEnc);
}
