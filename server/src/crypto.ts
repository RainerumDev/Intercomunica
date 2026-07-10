import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./config.js";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  return Buffer.from(config().ENCRYPTION_KEY, "hex");
}

/** Encrypt a UTF-8 string → "iv.tag.ciphertext" (base64url parts). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

/** Decrypt output of encrypt(). Throws on tampering. */
export function decrypt(token: string): string {
  const [ivB, tagB, encB] = token.split(".");
  if (!ivB || !tagB || !encB) throw new Error("malformed encrypted token");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
