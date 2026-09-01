import { useEffect, useMemo, useState } from "react";
import { adminResourcesApi, api } from "../api";
import ResourceCard from "../components/ResourceCard";
import ResourceEditor from "../components/ResourceEditor";
import { emptyResourceDraft, moveResourceId } from "../components/resourceForm";
import type { SharedResource, SharedResourceDraft, Subgroup } from "../types";

type EditorState = { resourceId: string | null; draft: SharedResourceDraft } | null;

export default function AdminResources() {
  const [resources, setResources] = useState<SharedResource[] | null>(null);
  const [subgroups, setSubgroups] = useState<Subgroup[] | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subgroupNames = useMemo(
    () => new Map((subgroups ?? []).map((subgroup) => [subgroup.id, subgroup.name])),
    [subgroups]
  );

  const loadResources = () => adminResourcesApi.list().then(setResources);

  useEffect(() => {
    Promise.all([
      loadResources(),
      api.get<Subgroup[]>("/api/subgroups").then(setSubgroups),
    ]).catch((loadError: Error) => setError(loadError.message));
  }, []);

  const openNew = () => {
    setError(null);
    setEditor({ resourceId: null, draft: { ...emptyResourceDraft, subgroupIds: [] } });
  };

  const openEdit = (resource: SharedResource) => {
    const draft: SharedResourceDraft = {
      url: resource.url,
      title: resource.title,
      description: resource.description,
      previewEnabled: resource.previewEnabled,
      previewImageUrl: resource.previewImageUrl,
      previewSiteName: resource.previewSiteName,
      isGlobal: resource.isGlobal,
      subgroupIds: [...resource.subgroupIds],
    };
    setError(null);
    setEditor({ resourceId: resource.id, draft });
  };

  const save = async (draft: SharedResourceDraft) => {
    if (!editor) return;
    const saved = editor.resourceId
      ? await adminResourcesApi.update(editor.resourceId, draft)
      : await adminResourcesApi.create(draft);
    setResources((current) => {
      if (!current) return [saved];
      const index = current.findIndex((resource) => resource.id === saved.id);
      if (index < 0) return [...current, saved];
      return current.map((resource) => resource.id === saved.id ? saved : resource);
    });
    setEditor(null);
  };

  const remove = async (resource: SharedResource) => {
    if (!window.confirm(`Eliminare la risorsa «${resource.title}»?`)) return;
    setBusyId(resource.id);
    setError(null);
    try {
      await adminResourcesApi.remove(resource.id);
      await loadResources();
      if (editor?.resourceId === resource.id) setEditor(null);
    } catch (removeError) {
      setError((removeError as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const move = async (resourceId: string, direction: "up" | "down") => {
    if (!resources) return;
    const previous = resources;
    const currentIds = previous.map((resource) => resource.id);
    const nextIds = moveResourceId(currentIds, resourceId, direction);
    if (nextIds === currentIds) return;

    const byId = new Map(previous.map((resource) => [resource.id, resource]));
    const optimistic = nextIds.map((id, sortOrder) => ({ ...byId.get(id)!, sortOrder }));
    setResources(optimistic);
    setBusyId(resourceId);
    setError(null);
    try {
      setResources(await adminResourcesApi.reorder(nextIds));
    } catch (moveError) {
      setResources(previous);
      setError((moveError as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (error && (!resources || !subgroups)) return <p className="text-red-600">{error}</p>;
  if (!resources || !subgroups) return <p className="text-gray-500">Caricamento risorse…</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Risorse condivise</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestisci i link visibili nella bacheca dei docenti.
          </p>
        </div>
        {!editor && (
          <button
            type="button"
            onClick={openNew}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            Nuova risorsa
          </button>
        )}
      </div>

      {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {editor && (
        <ResourceEditor
          key={editor.resourceId ?? "new"}
          initialDraft={editor.draft}
          subgroups={subgroups}
          onSave={save}
          onCancel={() => setEditor(null)}
        />
      )}

      {resources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          Nessuna risorsa condivisa. Aggiungi il primo link per iniziare.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {resources.map((resource, index) => {
            const audiences = resource.subgroupIds.map((id) => subgroupNames.get(id) ?? id);
            return (
              <ResourceCard key={resource.id} resource={resource}>
                {!resource.isGlobal && (
                  <p className="mb-2 text-xs text-gray-500">
                    Sottogruppi: {audiences.join(", ") || "nessuno"}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => move(resource.id, "up")}
                    disabled={index === 0 || busyId !== null}
                    className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Sposta su
                  </button>
                  <button
                    type="button"
                    onClick={() => move(resource.id, "down")}
                    disabled={index === resources.length - 1 || busyId !== null}
                    className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Sposta giù
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(resource)}
                    disabled={busyId !== null}
                    className="rounded border border-blue-700 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(resource)}
                    disabled={busyId !== null}
                    className="rounded border border-red-600 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Elimina
                  </button>
                </div>
              </ResourceCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
