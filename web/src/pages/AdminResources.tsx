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

  const refreshResourceAudiences = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const [loadedResources, loadedSubgroups] = await Promise.all([
        adminResourcesApi.list(),
        api.get<Subgroup[]>("/api/subgroups"),
      ]);
      setResources(loadedResources);
      setSubgroups(loadedSubgroups);
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
        if (error.code === "RESOURCE_AUDIENCE_CONFLICT") {
          await refreshResourceAudiences();
        } else {
          await refreshResources();
        }
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
    return <p role="status" aria-live="polite" className="portal-status">Caricamento risorse…</p>;
  }
  if (loadError && (!resources || !subgroups)) {
    return (
      <div className="feedback feedback--error">
        <p role="alert">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadCollection()}
          className="button button--danger mt-3"
        >
          Riprova
        </button>
      </div>
    );
  }
  if (!resources || !subgroups) return null;

  return (
    <div className="page" aria-busy={mutationsDisabled}>
      <div className="page-toolbar">
        <div>
          <h1 className="page-heading">Risorse condivise</h1>
          <p className="page-intro mt-1">
            Gestisci i link visibili nella bacheca dei docenti.
          </p>
        </div>
        {!editor && (
          <button
            type="button"
            onClick={openNew}
            disabled={mutationsDisabled}
            className="button button--primary"
          >
            Nuova risorsa
          </button>
        )}
      </div>

      {mutationError && (
        <p role="alert" className="feedback feedback--error">
          {mutationError}
        </p>
      )}
      {refreshError && (
        <div className="feedback feedback--warning">
          <p role="alert">{refreshError}</p>
          <button
            type="button"
            onClick={() => void refreshResourceAudiences()}
            disabled={mutationsDisabled}
            className="button button--neutral button--small mt-2"
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
        <div className="empty-state">
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
                    className="button button--neutral button--small"
                  >
                    Sposta su
                  </button>
                  <button
                    type="button"
                    onClick={() => move(resource.id, "down")}
                    disabled={index === resources.length - 1 || mutationsDisabled}
                    className="button button--neutral button--small"
                  >
                    Sposta giù
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(resource)}
                    disabled={mutationsDisabled}
                    className="button button--secondary button--small"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(resource)}
                    disabled={mutationsDisabled}
                    className="button button--danger button--small"
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
