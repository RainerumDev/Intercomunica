import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  subgroup: vi.fn(),
  config: vi.fn(),
  send: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    subgroup: { findUnique: mocks.subgroup },
    appConfig: { findUnique: mocks.config },
  },
}));
vi.mock("../google/master.js", () => ({
  gmailApi: async () => ({ users: { messages: { send: mocks.send } } }),
}));

import { emailRouter } from "./email.js";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { id: "teacher-1", email: "docente@rainerum.it", role: "TEACHER" };
  next();
});
app.use(emailRouter);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ name: "Mario Rossi" });
  mocks.config.mockResolvedValue({ masterEmail: "comunicazione@rainerum.it" });
  mocks.subgroup.mockResolvedValue({
    name: "Consiglio 3A",
    members: [{ user: { email: "destinatario@rainerum.it", isActive: true } }],
  });
  mocks.send.mockResolvedValue({ data: { id: "message-1" } });
});

async function send(mode = "to") {
  const response = await request(app).post("/send").send({
    subgroupId: "group-1",
    mode,
    subject: "Avviso",
    bodyHtml: "<p>Buongiorno</p>",
    fromName: "Nome non attendibile dal client",
  });
  expect(response.status).toBe(200);
  return Buffer.from(mocks.send.mock.calls[0][0].requestBody.raw, "base64url")
    .toString("utf8");
}

describe("email sender", () => {
  it.each(["to", "bcc"])("uses the authenticated teacher's name in %s mode", async (mode) => {
    const raw = await send(mode);
    expect(raw).toContain('From: "Mario Rossi | Intercomunica" <comunicazione@rainerum.it>\r\n');
    expect(raw).toContain("Reply-To: docente@rainerum.it\r\n");
    expect(raw).toContain(`${mode === "to" ? "To" : "Bcc"}: destinatario@rainerum.it\r\n`);
    expect(mocks.user).toHaveBeenCalledWith({
      where: { id: "teacher-1" }, select: { name: true },
    });
  });

  it("encodes accented teacher names as UTF-8", async () => {
    mocks.user.mockResolvedValue({ name: "José Müller" });
    const raw = await send();
    expect(raw).toContain("From: =?UTF-8?B?Sm9zw6kgTcO8bGxlciB8IEludGVyY29tdW5pY2E=?= <comunicazione@rainerum.it>\r\n");
  });

  it("quotes punctuation and prevents line breaks in the display name", async () => {
    mocks.user.mockResolvedValue({ name: 'Rossi, "Mario"\r\nBcc: intruso@example.com' });
    const raw = await send();
    expect(raw).toContain('From: "Rossi, \\"Mario\\" Bcc: intruso@example.com | Intercomunica" <comunicazione@rainerum.it>\r\n');
    expect(raw).not.toContain("\r\nBcc:");
  });

  it.each([null, "   "])("uses the teacher's email when the name is %s", async (name) => {
    mocks.user.mockResolvedValue({ name });
    expect(await send()).toContain('From: "docente@rainerum.it | Intercomunica" <comunicazione@rainerum.it>\r\n');
  });

  it("uses the configured account address", async () => {
    mocks.config.mockResolvedValue({ masterEmail: "altro-account@rainerum.it" });
    expect(await send()).toContain('From: "Mario Rossi | Intercomunica" <altro-account@rainerum.it>\r\n');
  });
});

function decodeBody(raw: string): string {
  return Buffer.from(raw.split("\r\n\r\n")[1], "base64").toString("utf8");
}

describe("email footer", () => {
  it.each(["to", "bcc"])("identifies the teacher and group with a linked app in %s mode", async (mode) => {
    const html = decodeBody(await send(mode));
    expect(html).toContain("<p>Buongiorno</p>");
    expect(html).toContain('Mail inviata da Mario Rossi a Consiglio 3A attraverso <a href="https://rainerum.it/intercomunica">Intercomunica</a>');
    expect(html).not.toContain("destinatario@rainerum.it");
    expect(html).not.toContain("Nome non attendibile dal client");
  });

  it("escapes teacher and group names as text in the HTML footer", async () => {
    mocks.user.mockResolvedValue({ name: 'Mario & <Rossi> "Docente"' });
    mocks.subgroup.mockResolvedValue({
      name: "L'arte & <3A>",
      members: [{ user: { email: "destinatario@rainerum.it", isActive: true } }],
    });
    const html = decodeBody(await send());
    expect(html).toContain("Mail inviata da Mario &amp; &lt;Rossi&gt; &quot;Docente&quot; a L&#39;arte &amp; &lt;3A&gt; attraverso");
    expect(html).not.toContain("<Rossi>");
    expect(html).not.toContain("<3A>");
  });

  it("falls back to the authenticated teacher's email in the footer", async () => {
    mocks.user.mockResolvedValue({ name: null });
    expect(decodeBody(await send())).toContain("Mail inviata da docente@rainerum.it a Consiglio 3A attraverso");
  });
});
