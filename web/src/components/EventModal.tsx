import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { AppEvent, Subgroup, Tag } from "../types";
import { asAllDayRange, asTimedValue, commitPendingTag, toEventIso } from "./eventForm";

export interface EventDraft {
  id?: string;
  title: string;
  description: string;
  location: string;
  startsAt: string; // datetime-local value
  endsAt: string;
  allDay: boolean;
  isGlobal: boolean;
  bachecaOnly: boolean;
  subgroupIds: string[];
  tagNames: string[];
}

interface Props {
  draft: EventDraft;
  subgroups: Subgroup[];
  knownTags: Tag[];
  readOnly?: boolean;
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
}

export default function EventModal({ draft, subgroups, knownTags, readOnly, onSaved, onDeleted, onClose }: Props) {
  const [form, setForm] = useState<EventDraft>(draft);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(draft.id);
  const subgroupFolders = useMemo(() => {
    const grouped = new Map<string, Subgroup[]>();
    for (const subgroup of subgroups) {
      const folder = subgroup.folder?.trim() || "Altri";
      grouped.set(folder, [...(grouped.get(folder) ?? []), subgroup]);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "it"))
      .map(([folder, entries]) => [folder, entries.sort((a, b) => a.name.localeCompare(b.name, "it"))] as const);
  }, [subgroups]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleSubgroup = (id: string) =>
    set(
      "subgroupIds",
      form.subgroupIds.includes(id)
        ? form.subgroupIds.filter((s) => s !== id)
        : [...form.subgroupIds, id]
    );

  const addTag = (name: string) => {
    set("tagNames", commitPendingTag(form.tagNames, name));
    setTagInput("");
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const tagNames = commitPendingTag(form.tagNames, tagInput);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      startsAt: toEventIso(form.startsAt, form.allDay),
      endsAt: toEventIso(form.endsAt, form.allDay),
      allDay: form.allDay,
      isGlobal: form.isGlobal,
      bachecaOnly: form.bachecaOnly,
      subgroupIds: form.isGlobal ? [] : form.subgroupIds,
      tagNames,
    };
    try {
      if (isEdit) await api.put<AppEvent>(`/api/events/${draft.id}`, payload);
      else await api.post<AppEvent>("/api/events", payload);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Eliminare l'evento da tutti i calendari?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/events/${draft.id}`);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const valid =
    form.title.trim() &&
    form.startsAt &&
    form.endsAt &&
    (form.isGlobal || form.bachecaOnly || form.subgroupIds.length > 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {readOnly ? "Dettagli evento" : isEdit ? "Modifica evento" : "Nuovo evento"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            ×
          </button>
        </div>

        <div className="space-y-4">
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            disabled={readOnly}
            placeholder="Titolo *"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium disabled:bg-gray-50 disabled:text-gray-700"
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-gray-600">
              Inizio
              <input
                type={form.allDay ? "date" : "datetime-local"}
                value={form.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
                disabled={readOnly}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-700"
              />
            </label>
            <label className="text-sm text-gray-600">
              Fine
              <input
                type={form.allDay ? "date" : "datetime-local"}
                value={form.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
                disabled={readOnly}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-700"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.allDay}
                disabled={readOnly}
                onChange={(e) => {
                  const allDay = e.target.checked;
                  setForm((current) => {
                    const range = allDay
                      ? asAllDayRange(current.startsAt, current.endsAt)
                      : {
                          startsAt: asTimedValue(current.startsAt, "08:00"),
                          endsAt: asTimedValue(current.endsAt, "09:00"),
                        };
                    return { ...current, allDay, ...range };
                  });
                }}
              />
              Tutto il giorno
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700" title="Se attivo, l'evento coinvolge tutti i docenti (ignora i sottogruppi)">
              <input
                type="checkbox"
                checked={form.isGlobal}
                disabled={readOnly}
                onChange={(e) => set("isGlobal", e.target.checked)}
              />
              🌍 Visibile a tutti
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700" title="Se attivo, l'evento resta sulla bacheca e nel calendario generale, senza copie personali">
              <input
                type="checkbox"
                checked={form.bachecaOnly}
                disabled={readOnly}
                onChange={(e) => set("bachecaOnly", e.target.checked)}
              />
              📌 Solo bacheca
            </label>
          </div>

          <input
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            disabled={readOnly}
            placeholder="Luogo"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-700"
          />
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            disabled={readOnly}
            placeholder="Descrizione"
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-700"
          />

          {/* Sottogruppi destinatari */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">
              Sottogruppi destinatari {form.isGlobal && <span className="text-gray-400">(ignorati per eventi visibili a tutti)</span>}
            </p>
            <div className="space-y-3">
              {subgroupFolders.map(([folder, entries]) => (
                <div key={folder} className="rounded-md border border-gray-200 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{folder}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {entries.map((s) => {
                      const on = form.subgroupIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => !readOnly && toggleSubgroup(s.id)}
                          disabled={readOnly}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            on
                              ? "bg-blue-100 border-blue-300 text-blue-800"
                              : "bg-white border-gray-200 text-gray-500 hover:border-blue-300"
                          } ${readOnly && !on ? "opacity-50" : ""}`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {subgroups.length === 0 && (
                <p className="text-sm text-gray-400">Nessun sottogruppo definito.</p>
              )}
            </div>
          </div>

          {/* TAG */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">TAG</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tagNames.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-800 px-3 py-1 text-xs font-medium"
                >
                  {t}
                  {!readOnly && (
                    <button
                      onClick={() => set("tagNames", form.tagNames.filter((x) => x !== t))}
                      className="text-purple-500 hover:text-purple-900"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            {!readOnly && (
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onBlur={() => addTag(tagInput)}
                  onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="Aggiungi TAG (es. RIUNIONI, GITE, CORSI)"
                list="known-tags"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <datalist id="known-tags">
                {knownTags.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
              <button
                onClick={() => addTag(tagInput)}
                disabled={!tagInput.trim()}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
              >
                +
              </button>
            </div>
            )}
          </div>

          {error && <p className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</p>}

          <div className="flex justify-between pt-2">
            {isEdit && !readOnly ? (
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-md border border-red-300 text-red-700 px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
              >
                Elimina
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {readOnly ? "Chiudi" : "Annulla"}
              </button>
              {!readOnly && (
                <button
                  onClick={save}
                  disabled={busy || !valid}
                  className="rounded-md bg-blue-700 px-4 py-2 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
                >
                  {busy ? "Salvataggio…" : "Salva"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
