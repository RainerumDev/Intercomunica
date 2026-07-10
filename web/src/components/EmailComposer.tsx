import { useState } from "react";
import { api } from "../api";
import type { Subgroup } from "../types";

interface Props {
  subgroup: Subgroup;
  onClose: () => void;
}

/** Flusso 4.2 — integrated email client, recipients pre-populated, To/Bcc selector (default To). */
export default function EmailComposer({ subgroup, onClose }: Props) {
  const [mode, setMode] = useState<"to" | "bcc">("to");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ recipientCount: number }>("/api/email/send", {
        subgroupId: subgroup.id,
        mode,
        subject,
        bodyHtml: body.replace(/\n/g, "<br>"),
      });
      setResult(`Email inviata a ${res.recipientCount} destinatari.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            ✉️ Email a «{subgroup.name}»
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            ×
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <p className="rounded bg-green-50 text-green-700 px-3 py-2">{result}</p>
            <button
              onClick={onClose}
              className="rounded-md bg-blue-700 px-4 py-2 text-white text-sm font-medium"
            >
              Chiudi
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-4 mb-1">
                <span className="text-sm font-medium text-gray-700">Destinatari:</span>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    checked={mode === "to"}
                    onChange={() => setMode("to")}
                  />
                  A:
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    checked={mode === "bcc"}
                    onChange={() => setMode("bcc")}
                  />
                  CCN:
                </label>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 max-h-24 overflow-y-auto">
                {subgroup.members.map((m) => m.email).join(", ") || "Nessun membro"}
              </div>
            </div>

            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Oggetto"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Scrivi il messaggio…"
              rows={8}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {error && <p className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={send}
                disabled={sending || !subject.trim() || !body.trim() || subgroup.members.length === 0}
                className="rounded-md bg-blue-700 px-4 py-2 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                {sending ? "Invio…" : "Invia"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
