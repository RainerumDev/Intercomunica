import { gmailApi } from "./master.js";
import { withRetry } from "./retry.js";

export interface SendEmailInput {
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
  const headers: string[] = [];
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
