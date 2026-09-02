import { useId, useState } from "react";
import { api } from "../api";
import type { Subgroup } from "../types";
import { useDialogFocus } from "./useDialogFocus";

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
  const titleId = useId();
  const dialogRef = useDialogFocus({ onClose });

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="dialog-panel max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="section-heading">
            ✉️ Email a «{subgroup.name}»
          </h2>
          <button aria-label="Chiudi composizione email" onClick={onClose} className="text-action text-xl">
            ×
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <p role="status" className="feedback feedback--success">{result}</p>
            <button
              onClick={onClose}
              className="button button--primary"
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
              className="form-control"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Scrivi il messaggio…"
              rows={8}
              className="form-control"
            />
            {error && <p role="alert" className="feedback feedback--error">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="button button--neutral"
              >
                Annulla
              </button>
              <button
                onClick={send}
                disabled={sending || !subject.trim() || !body.trim() || subgroup.members.length === 0}
                className="button button--primary"
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
