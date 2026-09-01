import { useMemo, useState } from "react";
import { adminResourcesApi } from "../api";
import type { SharedResourceDraft, Subgroup } from "../types";
import { normalizeResourceDraft } from "./resourceForm";
import ResourceCard from "./ResourceCard";

interface Props {
  initialDraft: SharedResourceDraft;
  subgroups: Subgroup[];
  onSave: (draft: SharedResourceDraft) => Promise<void>;
  onCancel: () => void;
}

function isPublicWebUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export default function ResourceEditor({ initialDraft, subgroups, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<SharedResourceDraft>(() => ({
    ...initialDraft,
    subgroupIds: [...initialDraft.subgroupIds],
  }));
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const subgroupFolders = useMemo(() => {
    const grouped = new Map<string, Subgroup[]>();
    for (const subgroup of subgroups) {
      const folder = subgroup.folder?.trim() || "Altri";
      grouped.set(folder, [...(grouped.get(folder) ?? []), subgroup]);
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "it"))
      .map(([folder, entries]) => [
        folder,
        entries.sort((left, right) => left.name.localeCompare(right.name, "it")),
      ] as const);
  }, [subgroups]);

  const set = <K extends keyof SharedResourceDraft>(key: K, value: SharedResourceDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const toggleSubgroup = (id: string) =>
    set(
      "subgroupIds",
      draft.subgroupIds.includes(id)
        ? draft.subgroupIds.filter((subgroupId) => subgroupId !== id)
        : [...draft.subgroupIds, id]
    );

  const generatePreview = async () => {
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const preview = await adminResourcesApi.preview(draft.url.trim());
      setDraft((current) => ({
        ...current,
        url: preview.finalUrl,
        title: current.title.trim() || preview.title || current.title,
        description: current.description?.trim() ? current.description : preview.description,
        previewEnabled: true,
        previewImageUrl: preview.imageUrl,
        previewSiteName: preview.siteName,
      }));
    } catch (error) {
      setPreviewError((error as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(normalizeResourceDraft(draft));
    } catch (error) {
      setSaveError((error as Error).message);
      setSaving(false);
    }
  };

  const valid =
    isPublicWebUrl(draft.url.trim()) &&
    Boolean(draft.title.trim()) &&
    (draft.isGlobal || draft.subgroupIds.length > 0);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {initialDraft.title ? "Modifica risorsa" : "Nuova risorsa"}
      </h2>

      <div className="space-y-4">
        <div>
          <label htmlFor="resource-url" className="mb-1 block text-sm font-medium text-gray-700">
            URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="resource-url"
              type="url"
              value={draft.url}
              onChange={(event) => set("url", event.target.value)}
              placeholder="https://esempio.it/risorsa"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={generatePreview}
              disabled={previewBusy || !isPublicWebUrl(draft.url.trim())}
              className="rounded-md border border-blue-700 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {previewBusy ? "Generazione…" : "Genera anteprima"}
            </button>
          </div>
          {previewError && (
            <p role="alert" className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {previewError}. Puoi comunque completare titolo e descrizione e salvare la risorsa.
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={draft.previewEnabled}
            onChange={(event) => set("previewEnabled", event.target.checked)}
          />
          Mostra anteprima
        </label>

        <div>
          <label htmlFor="resource-title" className="mb-1 block text-sm font-medium text-gray-700">
            Titolo
          </label>
          <input
            id="resource-title"
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={160}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="resource-description" className="mb-1 block text-sm font-medium text-gray-700">
            Descrizione
          </label>
          <textarea
            id="resource-description"
            value={draft.description ?? ""}
            onChange={(event) => set("description", event.target.value || null)}
            maxLength={500}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={draft.isGlobal}
            onChange={(event) => set("isGlobal", event.target.checked)}
          />
          Per tutti
        </label>

        {!draft.isGlobal && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Sottogruppi destinatari</p>
            <div className="space-y-3">
              {subgroupFolders.map(([folder, entries]) => (
                <fieldset key={folder} className="rounded-md border border-gray-200 p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {folder}
                  </legend>
                  <div className="flex flex-wrap gap-3">
                    {entries.map((subgroup) => (
                      <label key={subgroup.id} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={draft.subgroupIds.includes(subgroup.id)}
                          onChange={() => toggleSubgroup(subgroup.id)}
                        />
                        {subgroup.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              {subgroups.length === 0 && (
                <p className="text-sm text-gray-500">Nessun sottogruppo disponibile.</p>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Anteprima</p>
          <div className="max-w-md">
            <ResourceCard resource={draft} linked={false} />
          </div>
        </div>

        {saveError && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {saveError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !valid}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </div>
    </section>
  );
}
