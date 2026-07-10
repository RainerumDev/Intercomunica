import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/session.js";
import { sendEmail } from "../google/gmail.js";
import { h, parseBody } from "./helpers.js";

export const emailRouter = Router();

const sendSchema = z.object({
  subgroupId: z.string().min(1),
  /** Flusso 4.2 — "A:" (to) default, "CCN:" (bcc) optional */
  mode: z.enum(["to", "bcc"]).default("to"),
  subject: z.string().trim().min(1).max(300),
  bodyHtml: z.string().min(1).max(200_000),
  /** optional extra recipients typed by hand */
  extraRecipients: z.array(z.string().email()).default([]),
});

/**
 * Flusso 4 — send an email to all members of a subgroup.
 * Sent from the master account; Reply-To set to the logged-in teacher.
 */
emailRouter.post(
  "/send",
  requireAuth,
  h(async (req, res) => {
    const body = parseBody(sendSchema, req, res);
    if (!body) return;

    const subgroup = await prisma.subgroup.findUnique({
      where: { id: body.subgroupId },
      include: { members: { include: { user: true } } },
    });
    if (!subgroup) {
      res.status(404).json({ error: "Sottogruppo non trovato" });
      return;
    }
    const recipients = [
      ...subgroup.members.filter((m) => m.user.isActive).map((m) => m.user.email),
      ...body.extraRecipients.map((e) => e.toLowerCase()),
    ];
    const unique = [...new Set(recipients)];
    if (unique.length === 0) {
      res.status(400).json({ error: "Nessun destinatario nel sottogruppo" });
      return;
    }

    const messageId = await sendEmail({
      to: body.mode === "to" ? unique : [],
      bcc: body.mode === "bcc" ? unique : [],
      replyTo: req.user!.email,
      subject: body.subject,
      bodyHtml: body.bodyHtml,
    });
    res.json({ ok: true, messageId, recipientCount: unique.length });
  })
);
