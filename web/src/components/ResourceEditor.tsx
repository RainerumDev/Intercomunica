import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { adminResourcesApi } from "../api";
import type { SharedResourceDraft, Subgroup } from "../types";
import { normalizeResourceDraft } from "./resourceForm";
import ResourceCard from "./ResourceCard";

interface Props {
  initialDraft: SharedResourceDraft;
  subgroups: Subgroup[];
  onSave: (draft: SharedResourceDraft) => Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
}

function isPublicWebUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export default function ResourceEditor({ initialDraft, subgroups, onSave, onCancel, disabled = false }: Props) {
  const [draft, setDraft] = useState<SharedResourceDraft>(() => ({
    ...initialDraft,
    subgroupIds: [...initialDraft.subgroupIds],
  }));
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const previewGeneration = useRef(0);
  const previewFieldRevisions = useRef({
    title: 0,
    description: 0,
    previewEnabled: 0,
  });

  useEffect(() => () => {
    previewGeneration.current += 1;
  }, []);

  useEffect(() => {
    const availableSubgroupIds = new Set(subgroups.map((subgroup) => subgroup.id));
    setDraft((current) => {
      const subgroupIds = current.subgroupIds.filter((id) => availableSubgroupIds.has(id));
      return subgroupIds.length === current.subgroupIds.length
        ? current
        : { ...current, subgroupIds };
    });
  }, [subgroups]);

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

  const set = <K extends keyof SharedResourceDraft>(key: K, value: SharedResourceDraft[K]) => {
    if (key === "title") previewFieldRevisions.current.title += 1;
    if (key === "description") previewFieldRevisions.current.description += 1;
    if (key === "previewEnabled") previewFieldRevisions.current.previewEnabled += 1;
    setSaveError(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setUrl = (url: string) => {
    previewGeneration.current += 1;
    setPreviewBusy(false);
    setPreviewError(null);
    set("url", url);
  };

  const toggleSubgroup = (id: string) =>
    set(
      "subgroupIds",
      draft.subgroupIds.includes(id)
        ? draft.subgroupIds.filter((subgroupId) => subgroupId !== id)
        : [...draft.subgroupIds, id]
    );

  const generatePreview = async () => {
    if (disabled) return;
    const requestedUrl = draft.url.trim();
    const generation = ++previewGeneration.current;
    const fieldRevisions = { ...previewFieldRevisions.current };
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const preview = await adminResourcesApi.preview(requestedUrl);
      if (generation !== previewGeneration.current) return;
      setDraft((current) => current.url.trim() === requestedUrl
        ? {
            ...current,
            url: preview.finalUrl,
            title: fieldRevisions.title === previewFieldRevisions.current.title
              ? current.title.trim() || preview.title || current.title
              : current.title,
            description: fieldRevisions.description === previewFieldRevisions.current.description
              ? current.description?.trim() ? current.description : preview.description
              : current.description,
            previewEnabled: fieldRevisions.previewEnabled === previewFieldRevisions.current.previewEnabled
              ? true
              : current.previewEnabled,
            previewImageUrl: preview.imageUrl,
            previewSiteName: preview.siteName,
          }
        : current
      );
    } catch (error) {
      if (generation === previewGeneration.current) {
        setPreviewError((error as Error).message);
      }
    } finally {
      if (generation === previewGeneration.current) {
        setPreviewBusy(false);
      }
    }
  };

  const urlError = isPublicWebUrl(draft.url.trim()) ? null : "Inserisci un URL HTTP o HTTPS valido.";
  const titleError = draft.title.trim() ? null : "Inserisci un titolo.";
  const subgroupError = draft.isGlobal || draft.subgroupIds.length > 0
    ? null
    : "Seleziona almeno un sottogruppo.";

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    setValidationAttempted(true);
    if (urlError || titleError || subgroupError) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(normalizeResourceDraft(draft));
    } catch (error) {
      setSaveError((error as Error).message);
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {initialDraft.title ? "Modifica risorsa" : "Nuova risorsa"}
      </h2>

      <form className="space-y-4" onSubmit={save} noValidate>
        <div>
          <label htmlFor="resource-url" className="mb-1 block text-sm font-medium text-gray-700">
            URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="resource-url"
              type="url"
              disabled={disabled || saving}
              value={draft.url}
              onChange={(event) => setUrl(event.target.value)}
              aria-invalid={validationAttempted && Boolean(urlError)}
              aria-describedby={validationAttempted && urlError ? "resource-url-error" : undefined}
              placeholder="https://esempio.it/risorsa"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={generatePreview}
              disabled={disabled || previewBusy || !isPublicWebUrl(draft.url.trim())}
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
          {validationAttempted && urlError && (
            <p id="resource-url-error" className="mt-1 text-sm text-red-700">{urlError}</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            disabled={disabled || saving}
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
            disabled={disabled || saving}
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            aria-invalid={validationAttempted && Boolean(titleError)}
            aria-describedby={validationAttempted && titleError ? "resource-title-error" : undefined}
            maxLength={160}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {validationAttempted && titleError && (
            <p id="resource-title-error" className="mt-1 text-sm text-red-700">{titleError}</p>
          )}
        </div>

        <div>
          <label htmlFor="resource-description" className="mb-1 block text-sm font-medium text-gray-700">
            Descrizione
          </label>
          <textarea
            id="resource-description"
            disabled={disabled || saving}
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
            disabled={disabled || saving}
            checked={draft.isGlobal}
            onChange={(event) => set("isGlobal", event.target.checked)}
          />
          Per tutti
        </label>

        {!draft.isGlobal && (
          <fieldset
            aria-invalid={validationAttempted && Boolean(subgroupError)}
            aria-describedby={validationAttempted && subgroupError ? "resource-subgroups-error" : undefined}
          >
            <legend className="mb-2 text-sm font-medium text-gray-700">Sottogruppi destinatari</legend>
            <div className="space-y-3">
              {subgroupFolders.map(([folder, entries]) => (
                <div key={folder} role="group" aria-label={folder} className="rounded-md border border-gray-200 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {folder}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {entries.map((subgroup) => (
                      <label key={subgroup.id} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          disabled={disabled || saving}
                          checked={draft.subgroupIds.includes(subgroup.id)}
                          onChange={() => toggleSubgroup(subgroup.id)}
                        />
                        {subgroup.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {subgroups.length === 0 && (
                <p className="text-sm text-gray-500">Nessun sottogruppo disponibile.</p>
              )}
            </div>
            {validationAttempted && subgroupError && (
              <p id="resource-subgroups-error" className="mt-2 text-sm text-red-700">{subgroupError}</p>
            )}
          </fieldset>
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
            disabled={disabled || saving}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={disabled || saving}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </form>
    </section>
  );
}
