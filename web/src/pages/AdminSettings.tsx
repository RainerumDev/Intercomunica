import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { AdminConfig, GeneralCalendarSyncResult, SyncLogEntry, SyncResult } from "../types";
import AdminResources from "./AdminResources";

interface GroupOption {
  email: string;
  name?: string;
}

const NAME_PLACEHOLDER = "{nome}";
const PREVIEW_TEACHER = "Mario Rossi";
const GENERAL_CALENDAR_EXAMPLE = "c_b4c23e467aa6ec43d9d5da28d534233058f7c18cbc8c0341333535c72eb87c29@group.calendar.google.com";

export function CalendarSettings() {
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [groups, setGroups] = useState<GroupOption[] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [manualGroup, setManualGroup] = useState("");
  const [groupsHint, setGroupsHint] = useState<string | null>(null);
  const [nameTemplate, setNameTemplate] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [generalCalendarId, setGeneralCalendarId] = useState("");
  const [savingGeneralCalendar, setSavingGeneralCalendar] = useState(false);
  const [syncingGeneralCalendar, setSyncingGeneralCalendar] = useState(false);
  const [generalSyncResult, setGeneralSyncResult] = useState<GeneralCalendarSyncResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = () =>
    api.get<SyncLogEntry[]>("/api/admin/synclogs").then(setSyncLogs);

  const loadConfig = () =>
    api.get<AdminConfig>("/api/admin/config").then((c) => {
      setCfg(c);
      setSelectedGroup(c.mainGroupEmail ?? "");
      setNameTemplate(c.calendarNameTemplate);
      setGeneralCalendarId(c.generalCalendarId ?? "");
    });

  useEffect(() => {
    Promise.all([loadConfig(), loadLogs()]).catch((e: Error) => setError(e.message));
  }, []);

  const loadGroups = async () => {
    setError(null);
    setGroupsHint(null);
    try {
      setGroups(await api.get<GroupOption[]>("/api/admin/groups"));
    } catch (e) {
      // no admin role on the master account: expected — steer to manual entry
      if (e instanceof ApiError && e.code === "DIRECTORY_FORBIDDEN") {
        setGroupsHint(
          "Elenco non disponibile: l'account master non ha un ruolo amministratore (non è necessario). Usa l'inserimento manuale qui sotto."
        );
      } else {
        setError((e as Error).message);
      }
    }
  };

  const saveNameTemplate = async () => {
    setError(null);
    setNameSaved(false);
    try {
      await api.post("/api/admin/calendar-name", { template: nameTemplate.trim() });
      setNameSaved(true);
      await loadConfig();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const insertPlaceholder = () => {
    const input = nameInputRef.current;
    const pos = input?.selectionStart ?? nameTemplate.length;
    const next = nameTemplate.slice(0, pos) + NAME_PLACEHOLDER + nameTemplate.slice(pos);
    setNameTemplate(next);
    setNameSaved(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(pos + NAME_PLACEHOLDER.length, pos + NAME_PLACEHOLDER.length);
    });
  };

  const saveGroup = async (groupEmail: string) => {
    setError(null);
    try {
      await api.post("/api/admin/group", { groupEmail });
      setManualGroup("");
      await loadConfig();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      setSyncResult(await api.post<SyncResult>("/api/admin/sync"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
      loadLogs().catch(() => {});
    }
  };

  const saveGeneralCalendar = async () => {
    setSavingGeneralCalendar(true);
    setGeneralSyncResult(null);
    setError(null);
    try {
      await api.post("/api/admin/general-calendar", { calendarId: generalCalendarId.trim() });
      await loadConfig();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingGeneralCalendar(false);
    }
  };

  const syncGeneralCalendar = async () => {
    setSyncingGeneralCalendar(true);
    setGeneralSyncResult(null);
    setError(null);
    try {
      setGeneralSyncResult(
        await api.post<GeneralCalendarSyncResult>("/api/admin/general-calendar/sync")
      );
      await loadConfig();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncingGeneralCalendar(false);
    }
  };

  if (!cfg) return <p role="status" aria-live="polite" className="portal-status">Caricamento…</p>;

  return (
    <div className="page page--narrow">
      <h1 className="page-heading">Impostazioni</h1>
      {error && <p role="alert" className="feedback feedback--error">{error}</p>}

      {/* Flusso 1.1 — account master */}
      <section className="surface-card surface-card--padded">
        <h2 className="section-heading mb-2">1. Account master</h2>
        {cfg.masterConnected ? (
          <p className="text-sm text-green-700">
            ✓ Collegato: <strong>{cfg.masterEmail}</strong>
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            Nessun account collegato. Collega l'account istituzionale delegato (es.
            comunicazione@rainerum.it).
          </p>
        )}
        <a
          href="/api/admin/master/connect"
          className="button button--primary mt-3"
        >
          {cfg.masterConnected ? "Ricollega account" : "Collega account Google"}
        </a>
      </section>

      {/* Flusso 1.2 — gruppo principale */}
      <section className="surface-card surface-card--padded">
        <h2 className="section-heading mb-2">2. Gruppo Google principale</h2>
        <p className="text-sm text-gray-500 mb-3">
          Il gruppo che contiene tutti i docenti (es. docenti@rainerum.it).
          {cfg.mainGroupEmail && (
            <>
              {" "}
              Attuale: <strong className="text-gray-800">{cfg.mainGroupEmail}</strong>
            </>
          )}
        </p>
        {groups === null ? (
          <button
            onClick={loadGroups}
            disabled={!cfg.masterConnected}
            className="button button--secondary"
          >
            Carica gruppi del dominio
          </button>
        ) : (
          <div className="flex gap-2">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="form-control flex-1"
            >
              <option value="">— seleziona gruppo —</option>
              {groups.map((g) => (
                <option key={g.email} value={g.email}>
                  {g.name ? `${g.name} (${g.email})` : g.email}
                </option>
              ))}
            </select>
            <button
              onClick={() => saveGroup(selectedGroup)}
              disabled={!selectedGroup}
              className="button button--primary"
            >
              Salva
            </button>
          </div>
        )}

        {groupsHint && (
          <p className="feedback feedback--warning mt-2">{groupsHint}</p>
        )}

        {/* Fallback: manual entry — works even without Directory list privileges */}
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-400 mb-2">
            In alternativa, inserisci direttamente l'indirizzo del gruppo:
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={manualGroup}
              onChange={(e) => setManualGroup(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && manualGroup.includes("@") && saveGroup(manualGroup.trim())}
              placeholder="docenti@rainerum.it"
              disabled={!cfg.masterConnected}
              className="form-control flex-1"
            />
            <button
              onClick={() => saveGroup(manualGroup.trim())}
              disabled={!cfg.masterConnected || !manualGroup.includes("@")}
              className="button button--secondary"
            >
              Salva
            </button>
          </div>
        </div>
      </section>

      {/* Nome dei calendari docente */}
      <section className="surface-card surface-card--padded">
        <h2 className="section-heading mb-2">3. Nome dei calendari</h2>
        <p className="text-sm text-gray-500 mb-3">
          Modello usato per il nome del calendario di ogni docente. Usa il segnaposto{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{NAME_PLACEHOLDER}</code> per
          inserire il nome del docente nel punto desiderato.
        </p>
        <div className="flex gap-2">
          <input
            ref={nameInputRef}
            value={nameTemplate}
            onChange={(e) => {
              setNameTemplate(e.target.value);
              setNameSaved(false);
            }}
            placeholder={`Calendario Rainerum 26/27 - ${NAME_PLACEHOLDER}`}
            className="form-control flex-1 font-mono"
          />
          <button
            onClick={insertPlaceholder}
            title="Inserisci il segnaposto del nome docente nella posizione del cursore"
            className="button button--neutral whitespace-nowrap"
          >
            + Nome docente
          </button>
          <button
            onClick={saveNameTemplate}
            disabled={!nameTemplate.trim() || nameTemplate === cfg.calendarNameTemplate}
            className="button button--primary"
          >
            Salva
          </button>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Anteprima:{" "}
          <span className="font-medium text-gray-900">
            {(nameTemplate.trim() || `Calendario Rainerum 26/27 - ${NAME_PLACEHOLDER}`).replaceAll(
              NAME_PLACEHOLDER,
              PREVIEW_TEACHER
            )}
          </span>
        </p>
        {!nameTemplate.includes(NAME_PLACEHOLDER) && nameTemplate.trim() !== "" && (
          <p className="feedback feedback--warning mt-2">
            ⚠️ Senza {NAME_PLACEHOLDER} tutti i calendari avranno lo stesso identico nome.
          </p>
        )}
        {nameSaved && (
          <p className="feedback feedback--success mt-2">
            ✓ Salvato. I calendari esistenti verranno rinominati alla prossima sincronizzazione.
          </p>
        )}
      </section>

      <section className="surface-card surface-card--padded">
        <h2 className="section-heading mb-2">4. Calendario generale</h2>
        <p className="text-sm text-gray-500 mb-3">
          Tutti gli eventi vengono salvati qui. Gli eventi creati direttamente su Google vengono
          importati come visibili a tutti; la prima importazione considera gli ultimi 30 giorni e il futuro.
        </p>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="general-calendar-id">
          ID calendario Google
        </label>
        <div className="flex gap-2">
          <input
            id="general-calendar-id"
            value={generalCalendarId}
            onChange={(event) => setGeneralCalendarId(event.target.value)}
            placeholder={GENERAL_CALENDAR_EXAMPLE}
            className="form-control flex-1 font-mono"
          />
          <button
            onClick={saveGeneralCalendar}
            disabled={savingGeneralCalendar || !generalCalendarId.trim() || generalCalendarId.trim() === cfg.generalCalendarId}
            className="button button--primary"
          >
            {savingGeneralCalendar ? "Collegamento…" : "Salva e collega"}
          </button>
        </div>
        {cfg.generalCalendarId && (
          <div className="mt-4 rounded-md bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600 space-y-1">
            <p>✓ Calendario collegato</p>
            <p>Ultima sincronizzazione: {cfg.generalCalendarLastSyncAt ? new Date(cfg.generalCalendarLastSyncAt).toLocaleString("it-IT") : "mai"}</p>
            <p>Webhook valido fino a: {cfg.generalCalendarWatchExpiresAt ? new Date(cfg.generalCalendarWatchExpiresAt).toLocaleString("it-IT") : "non attivo"}</p>
            {cfg.generalCalendarLastError && <p className="text-red-700">Ultimo errore: {cfg.generalCalendarLastError}</p>}
            <button
              onClick={syncGeneralCalendar}
              disabled={syncingGeneralCalendar}
              className="button button--success mt-2"
            >
              {syncingGeneralCalendar ? "Sincronizzazione…" : "Sincronizza calendario generale"}
            </button>
            {generalSyncResult && (
              <p className="text-green-700">
                Importati {generalSyncResult.imported}, aggiornati {generalSyncResult.updated}, eliminati {generalSyncResult.deleted}.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Flusso 1.3/1.4 — sync */}
      <section className="surface-card surface-card--padded">
        <h2 className="section-heading mb-2">5. Sincronizzazione docenti</h2>
        <p className="text-sm text-gray-500 mb-3">
          Importa i membri del gruppo, crea i calendari condivisi mancanti e riconcilia gli
          eventi tra database e Google Calendar.
        </p>
        <button
          onClick={runSync}
          disabled={syncing || !cfg.masterConnected || !cfg.mainGroupEmail}
          className="button button--success"
        >
          {syncing ? "Sincronizzazione in corso…" : "🔄 Sincronizza / Refresh"}
        </button>
        {syncLogs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Storico sincronizzazioni</h3>
            <div className="table-shell">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Avviata</th>
                    <th className="px-3 py-2 font-medium">Esito</th>
                    <th className="px-3 py-2 font-medium">Dettagli</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {syncLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                        {new Date(l.startedAt).toLocaleString("it-IT")}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${
                            l.status === "SUCCESS"
                              ? "bg-green-100 text-green-800"
                              : l.status === "ERROR"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 max-w-md truncate" title={l.message ?? ""}>
                        {l.message ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {syncResult && (
          <div className="mt-4 rounded bg-gray-50 border border-gray-200 p-4 text-sm space-y-1">
            <p>Nuovi docenti: {syncResult.added.length}</p>
            <p>Disattivati: {syncResult.deactivated.length}</p>
            <p>Riattivati: {syncResult.reactivated.length}</p>
            <p>Calendari creati: {syncResult.calendarsCreated.length}</p>
            <p>Calendari rinominati: {syncResult.calendarsRenamed.length}</p>
            <p>Eventi re-iniettati: {syncResult.eventsReinjected}</p>
            <p>Eventi orfani rimossi: {syncResult.orphansRemoved}</p>
            {syncResult.errors.length > 0 && (
              <div className="text-red-700">
                Errori:
                <ul className="list-disc ml-5">
                  {syncResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

type SettingsTab = "calendar" | "resources";

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("calendar");
  const [resourcesActivated, setResourcesActivated] = useState(false);

  const selectTab = (tab: SettingsTab, focus = true) => {
    if (tab === "resources") setResourcesActivated(true);
    setActiveTab(tab);
    if (focus) {
      requestAnimationFrame(() => document.getElementById(`settings-${tab}-tab`)?.focus());
    }
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      selectTab(activeTab === "calendar" ? "resources" : "calendar");
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab("calendar");
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab("resources");
    }
  };

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Sezioni delle impostazioni"
        className="tabs"
      >
        <button
          id="settings-calendar-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "calendar"}
          aria-controls="settings-calendar-panel"
          tabIndex={activeTab === "calendar" ? 0 : -1}
          onClick={() => selectTab("calendar", false)}
          onKeyDown={onTabKeyDown}
          className={`tab${activeTab === "calendar" ? " tab--active" : ""}`}
        >
          Calendario
        </button>
        <button
          id="settings-resources-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "resources"}
          aria-controls="settings-resources-panel"
          tabIndex={activeTab === "resources" ? 0 : -1}
          onClick={() => selectTab("resources", false)}
          onKeyDown={onTabKeyDown}
          className={`tab${activeTab === "resources" ? " tab--active" : ""}`}
        >
          Risorse condivise
        </button>
      </div>

      <div
        id="settings-calendar-panel"
        role="tabpanel"
        aria-labelledby="settings-calendar-tab"
        hidden={activeTab !== "calendar"}
      >
        <CalendarSettings />
      </div>
      <div
        id="settings-resources-panel"
        role="tabpanel"
        aria-labelledby="settings-resources-tab"
        hidden={activeTab !== "resources"}
      >
        {resourcesActivated && <AdminResources />}
      </div>
    </div>
  );
}
