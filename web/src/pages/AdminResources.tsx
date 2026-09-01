import { useCallback, useEffect, useMemo, useState } from "react";
import { adminResourcesApi, api, ApiError } from "../api";
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const mutationsDisabled = busyId !== null || refreshing;

  const subgroupNames = useMemo(
    () => new Map((subgroups ?? []).map((subgroup) => [subgroup.id, subgroup.name])),
    [subgroups]
  );

  const loadCollection = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [loadedResources, loadedSubgroups] = await Promise.all([
        adminResourcesApi.list(),
        api.get<Subgroup[]>("/api/subgroups"),
      ]);
      setResources(loadedResources);
      setSubgroups(loadedSubgroups);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshResources = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      setResources(await adminResourcesApi.list());
    } catch (error) {
      setRefreshError((error as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadCollection();
  }, [loadCollection]);

  const openNew = () => {
    if (mutationsDisabled) return;
    setMutationError(null);
    setEditor({ resourceId: null, draft: { ...emptyResourceDraft, subgroupIds: [] } });
  };

  const openEdit = (resource: SharedResource) => {
    if (mutationsDisabled) return;
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
    setMutationError(null);
    setEditor({ resourceId: resource.id, draft });
  };

  const save = async (draft: SharedResourceDraft) => {
    if (!editor || mutationsDisabled) return;
    setBusyId(editor.resourceId ?? "new-resource");
    setMutationError(null);
    try {
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
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await refreshResources();
      }
      throw error;
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (resource: SharedResource) => {
    if (mutationsDisabled) return;
    if (!window.confirm(`Eliminare la risorsa «${resource.title}»?`)) return;
    setBusyId(resource.id);
    setMutationError(null);
    try {
      await adminResourcesApi.remove(resource.id);
      setResources((current) => current?.filter((item) => item.id !== resource.id) ?? []);
      setEditor((current) => current?.resourceId === resource.id ? null : current);
      await refreshResources();
    } catch (removeError) {
      setMutationError((removeError as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const move = async (resourceId: string, direction: "up" | "down") => {
    if (!resources || mutationsDisabled) return;
    const previous = resources;
    const currentIds = previous.map((resource) => resource.id);
    const nextIds = moveResourceId(currentIds, resourceId, direction);
    if (nextIds === currentIds) return;

    const byId = new Map(previous.map((resource) => [resource.id, resource]));
    const optimistic = nextIds.map((id, sortOrder) => ({ ...byId.get(id)!, sortOrder }));
    setResources(optimistic);
    setBusyId(resourceId);
    setMutationError(null);
    try {
      setResources(await adminResourcesApi.reorder(nextIds));
    } catch (moveError) {
      setResources(previous);
      setMutationError((moveError as Error).message);
      if (moveError instanceof ApiError && moveError.status === 409) {
        await refreshResources();
      }
    } finally {
      setBusyId(null);
    }
  };

  if (loading && (!resources || !subgroups)) {
    return <p role="status" aria-live="polite" className="text-gray-500">Caricamento risorse…</p>;
  }
  if (loadError && (!resources || !subgroups)) {
    return (
      <div className="rounded bg-red-50 p-4 text-sm text-red-700">
        <p role="alert">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadCollection()}
          className="mt-3 rounded border border-red-600 px-3 py-1.5 font-medium hover:bg-red-100"
        >
          Riprova
        </button>
      </div>
    );
  }
  if (!resources || !subgroups) return null;

  return (
    <div className="max-w-4xl space-y-6" aria-busy={mutationsDisabled}>
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
            disabled={mutationsDisabled}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            Nuova risorsa
          </button>
        )}
      </div>

      {mutationError && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {mutationError}
        </p>
      )}
      {refreshError && (
        <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p role="alert">{refreshError}</p>
          <button
            type="button"
            onClick={() => void refreshResources()}
            disabled={mutationsDisabled}
            className="mt-2 rounded border border-amber-700 px-2.5 py-1 font-medium hover:bg-amber-100"
          >
            Riprova aggiornamento
          </button>
        </div>
      )}
      {mutationsDisabled && (
        <p role="status" aria-live="polite" className="sr-only">
          {refreshing ? "Aggiornamento elenco…" : "Operazione in corso…"}
        </p>
      )}

      {editor && (
        <ResourceEditor
          key={editor.resourceId ?? "new"}
          initialDraft={editor.draft}
          subgroups={subgroups}
          onSave={save}
          onCancel={() => {
            if (!mutationsDisabled) setEditor(null);
          }}
          disabled={mutationsDisabled}
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
                    disabled={index === 0 || mutationsDisabled}
                    className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Sposta su
                  </button>
                  <button
                    type="button"
                    onClick={() => move(resource.id, "down")}
                    disabled={index === resources.length - 1 || mutationsDisabled}
                    className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Sposta giù
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(resource)}
                    disabled={mutationsDisabled}
                    className="rounded border border-blue-700 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(resource)}
                    disabled={mutationsDisabled}
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
