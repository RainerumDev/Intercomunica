import { useEffect, useState } from "react";
import { api } from "../api";
import type { AdminConfig, SyncLogEntry, SyncResult } from "../types";

interface GroupOption {
  email: string;
  name?: string;
}

export default function AdminSettings() {
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [groups, setGroups] = useState<GroupOption[] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [manualGroup, setManualGroup] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = () =>
    api.get<SyncLogEntry[]>("/api/admin/synclogs").then(setSyncLogs);

  const loadConfig = () =>
    api.get<AdminConfig>("/api/admin/config").then((c) => {
      setCfg(c);
      setSelectedGroup(c.mainGroupEmail ?? "");
    });

  useEffect(() => {
    Promise.all([loadConfig(), loadLogs()]).catch((e: Error) => setError(e.message));
  }, []);

  const loadGroups = async () => {
    setError(null);
    try {
      setGroups(await api.get<GroupOption[]>("/api/admin/groups"));
    } catch (e) {
      setError((e as Error).message);
    }
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

  if (!cfg) return <p className="text-gray-500">Caricamento…</p>;

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Impostazioni</h1>
      {error && <p className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</p>}

      {/* Flusso 1.1 — account master */}
      <section className="rounded-lg bg-white border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-2">1. Account master</h2>
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
          className="mt-3 inline-block rounded-md bg-blue-700 px-4 py-2 text-white text-sm font-medium hover:bg-blue-800"
        >
          {cfg.masterConnected ? "Ricollega account" : "Collega account Google"}
        </a>
      </section>

      {/* Flusso 1.2 — gruppo principale */}
      <section className="rounded-lg bg-white border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-2">2. Gruppo Google principale</h2>
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
            className="rounded-md border border-blue-700 text-blue-700 px-4 py-2 text-sm font-medium hover:bg-blue-50 disabled:opacity-50"
          >
            Carica gruppi del dominio
          </button>
        ) : (
          <div className="flex gap-2">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
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
              className="rounded-md bg-blue-700 px-4 py-2 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
            >
              Salva
            </button>
          </div>
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
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            />
            <button
              onClick={() => saveGroup(manualGroup.trim())}
              disabled={!cfg.masterConnected || !manualGroup.includes("@")}
              className="rounded-md border border-blue-700 text-blue-700 px-4 py-2 text-sm font-medium hover:bg-blue-50 disabled:opacity-50"
            >
              Salva
            </button>
          </div>
        </div>
      </section>

      {/* Flusso 1.3/1.4 — sync */}
      <section className="rounded-lg bg-white border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-2">3. Sincronizzazione</h2>
        <p className="text-sm text-gray-500 mb-3">
          Importa i membri del gruppo, crea i calendari condivisi mancanti e riconcilia gli
          eventi tra database e Google Calendar.
        </p>
        <button
          onClick={runSync}
          disabled={syncing || !cfg.masterConnected || !cfg.mainGroupEmail}
          className="rounded-md bg-green-700 px-4 py-2 text-white text-sm font-medium hover:bg-green-800 disabled:opacity-50"
        >
          {syncing ? "Sincronizzazione in corso…" : "🔄 Sincronizza / Refresh"}
        </button>
        {syncLogs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Storico sincronizzazioni</h3>
            <div className="overflow-x-auto rounded border border-gray-200">
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
