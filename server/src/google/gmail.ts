import { gmailApi } from "./master.js";
import { withRetry } from "./retry.js";
import { prisma } from "../db.js";

export interface SendEmailInput {
  fromName: string;
  to: string[];
  bcc: string[];
  replyTo?: string;
  subject: string;
  bodyHtml: string;
}

/** RFC 2047 encode a header value if it contains non-ASCII characters. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Send an email from the master account via the Gmail API. */
export async function sendEmail(input: SendEmailInput): Promise<string> {
  const gmail = await gmailApi();
  const cfg = await prisma.appConfig.findUnique({
    where: { id: 1 },
    select: { masterEmail: true },
  });
  if (!cfg?.masterEmail) throw new Error("Indirizzo dell'account master non configurato");

  // Display names are phrases: quote ASCII punctuation and encode Unicode.
  const name = input.fromName.replace(/[\r\n]+/g, " ").trim();
  const encodedName = encodeHeader(name);
  const displayName = encodedName === name
    ? `"${name.replace(/[\\"]/g, "\\$&")}"`
    : encodedName;
  const headers: string[] = [`From: ${displayName} <${cfg.masterEmail}>`];
  if (input.to.length > 0) headers.push(`To: ${input.to.join(", ")}`);
  if (input.bcc.length > 0) headers.push(`Bcc: ${input.bcc.join(", ")}`);
  if (input.replyTo) headers.push(`Reply-To: ${input.replyTo}`);
  headers.push(`Subject: ${encodeHeader(input.subject)}`);
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/html; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: base64");

  const raw = Buffer.from(
    headers.join("\r\n") + "\r\n\r\n" + Buffer.from(input.bodyHtml, "utf8").toString("base64"),
    "utf8"
  ).toString("base64url");

  const res = await withRetry(() =>
    gmail.users.messages.send({ userId: "me", requestBody: { raw } })
  );
  if (!res.data.id) throw new Error("Gmail non ha restituito l'ID del messaggio inviato");
  return res.data.id;
}
