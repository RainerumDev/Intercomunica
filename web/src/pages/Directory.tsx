import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Member, Subgroup } from "../types";
import EmailComposer from "../components/EmailComposer";
import MemberSubgroupCell from "../components/MemberSubgroupCell";

export default function Directory() {
  const { me } = useAuth();
  const isAdmin = me?.role === "ADMIN";
  const [members, setMembers] = useState<Member[]>([]);
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);
  const [q, setQ] = useState("");
  const [subgroupQ, setSubgroupQ] = useState("");
  const [emailTarget, setEmailTarget] = useState<Subgroup | null>(null);
  const [newSubgroup, setNewSubgroup] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [error, setError] = useState<string | null>(null);

  const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );

  const reload = async () => {
    const [m, s] = await Promise.all([
      api.get<Member[]>("/api/users"),
      api.get<Subgroup[]>("/api/subgroups"),
    ]);
    setMembers(m);
    setSubgroups(s);
  };

  useEffect(() => {
    reload().catch((e: Error) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle) ||
        m.subgroups.some((s) => s.name.toLowerCase().includes(needle))
    );
  }, [members, q]);

  const filteredSubgroups = useMemo(() => {
    const needle = subgroupQ.trim().toLowerCase();
    if (!needle) return subgroups;
    return subgroups.filter((s) => s.name.toLowerCase().includes(needle) || (s.folder?.toLowerCase() ?? "").includes(needle));
  }, [subgroups, subgroupQ]);

  const groupedSubgroups = useMemo(() => {
    const groups: Record<string, Subgroup[]> = {};
    filteredSubgroups.forEach(s => {
      const folder = s.folder?.trim() || "Generale";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(s);
    });
    return groups;
  }, [filteredSubgroups]);

  const addMembership = async (member: Member, subgroupId: string) => {
    setError(null);
    try {
      await api.post(`/api/subgroups/${subgroupId}/members`, { userId: member.id });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeMembership = async (member: Member, subgroupId: string) => {
    setError(null);
    try {
      await api.delete(`/api/subgroups/${subgroupId}/members/${member.id}`);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const createSubgroup = async () => {
    setError(null);
    try {
      await api.post("/api/subgroups", { name: newSubgroup.trim(), folder: newFolder.trim() || null });
      setNewSubgroup("");
      setNewFolder("");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteSubgroup = async (s: Subgroup) => {
    if (!window.confirm(`Eliminare il sottogruppo «${s.name}»?`)) return;
    setError(null);
    try {
      await api.delete(`/api/subgroups/${s.id}`);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Gruppi & Docenti</h1>
      {error && <p className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</p>}

      {/* Sottogruppi (Flusso 2.1 + Flusso 4) */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-4">
          <h2 className="text-lg font-semibold text-gray-800">Sottogruppi</h2>
          <input
            value={subgroupQ}
            onChange={(e) => setSubgroupQ(e.target.value)}
            placeholder="Cerca sottogruppo…"
            className="w-72 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-6">
          {Object.entries(groupedSubgroups).sort().map(([folder, list]) => (
            <div key={folder}>
              <h3 className="text-md font-bold text-gray-700 mb-2 border-b pb-1">{folder}</h3>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {list.map((s) => (
                  <div key={s.id} className="flex flex-col justify-between rounded border border-gray-200 bg-white p-2.5 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate flex-1">
                        <h4 className="text-sm font-medium text-gray-900 truncate" title={s.name}>{s.name}</h4>
                        <p className="text-xs text-gray-500">{s.members.length} membri</p>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => deleteSubgroup(s)}
                          title="Elimina sottogruppo"
                          className="text-gray-400 hover:text-red-600 shrink-0 mt-0.5"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => setEmailTarget(s)}
                      disabled={s.members.length === 0}
                      className="mt-2.5 w-full rounded border border-blue-600 text-blue-700 px-2 py-1 text-xs font-medium hover:bg-blue-50 disabled:opacity-40"
                    >
                      ✉️ Invia Email
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {isAdmin && subgroupQ.trim() === "" && (
            <div className="rounded border border-dashed border-gray-300 p-3 bg-gray-50/50 mt-6 max-w-xl">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Aggiungi nuovo sottogruppo</h4>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={newSubgroup}
                  onChange={(e) => setNewSubgroup(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newSubgroup.trim() && createSubgroup()}
                  placeholder="Nome (es. 1A)"
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
                <input
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newSubgroup.trim() && createSubgroup()}
                  placeholder="Cartella (opzionale)"
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  list="folders"
                />
                <datalist id="folders">
                  {Object.keys(groupedSubgroups).map(f => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
                <button
                  onClick={createSubgroup}
                  disabled={!newSubgroup.trim()}
                  className="rounded bg-blue-700 px-4 py-1.5 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50 shrink-0"
                >
                  + Crea
                </button>
              </div>
            </div>
          )}
        </div>
        {filteredSubgroups.length === 0 && (
          <p className="text-sm text-gray-400 py-4">
            {subgroups.length === 0
              ? "Nessun sottogruppo definito."
              : "Nessun sottogruppo corrisponde alla ricerca."}
          </p>
        )}
      </section>

      {/* Anagrafica (Flusso 2.2) */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-4">
          <h2 className="text-lg font-semibold text-gray-800">Docenti</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per nome, email o sottogruppo…"
            className="w-72 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Docente</th>
                <th className="px-4 py-3 font-medium">Sottogruppi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{m.name ?? "—"}</div>
                    <div className="text-gray-500">{m.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <MemberSubgroupCell
                      member={m}
                      allSubgroups={subgroups}
                      isAdmin={isAdmin}
                      onAdd={addMembership}
                      onRemove={removeMembership}
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-gray-400">
                    Nessun docente trovato. {members.length === 0 && "Esegui la sincronizzazione dalle Impostazioni."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {emailTarget && <EmailComposer subgroup={emailTarget} onClose={() => setEmailTarget(null)} />}
    </div>
  );
}
