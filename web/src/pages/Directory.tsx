import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Member, Subgroup } from "../types";
import EmailComposer from "../components/EmailComposer";

export default function Directory() {
  const { me } = useAuth();
  const isAdmin = me?.role === "ADMIN";
  const [members, setMembers] = useState<Member[]>([]);
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);
  const [q, setQ] = useState("");
  const [emailTarget, setEmailTarget] = useState<Subgroup | null>(null);
  const [newSubgroup, setNewSubgroup] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  const toggleMembership = async (member: Member, subgroupId: string, isIn: boolean) => {
    setError(null);
    try {
      if (isIn) await api.delete(`/api/subgroups/${subgroupId}/members/${member.id}`);
      else await api.post(`/api/subgroups/${subgroupId}/members`, { userId: member.id });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const createSubgroup = async () => {
    setError(null);
    try {
      await api.post("/api/subgroups", { name: newSubgroup.trim() });
      setNewSubgroup("");
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
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Sottogruppi</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subgroups.map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium text-gray-900">{s.name}</h3>
                  <p className="text-sm text-gray-500">{s.members.length} membri</p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => deleteSubgroup(s)}
                    title="Elimina sottogruppo"
                    className="text-gray-300 hover:text-red-600"
                  >
                    🗑
                  </button>
                )}
              </div>
              <button
                onClick={() => setEmailTarget(s)}
                disabled={s.members.length === 0}
                className="mt-3 w-full rounded-md border border-blue-700 text-blue-700 px-3 py-1.5 text-sm font-medium hover:bg-blue-50 disabled:opacity-40"
              >
                ✉️ Invia Email
              </button>
            </div>
          ))}
          {isAdmin && (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 flex flex-col justify-center gap-2">
              <input
                value={newSubgroup}
                onChange={(e) => setNewSubgroup(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newSubgroup.trim() && createSubgroup()}
                placeholder="Nuovo sottogruppo (es. Consiglio di Classe 1A)"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={createSubgroup}
                disabled={!newSubgroup.trim()}
                className="rounded-md bg-blue-700 px-3 py-1.5 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                + Crea
              </button>
            </div>
          )}
        </div>
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
                    <div className="flex flex-wrap gap-1.5">
                      {subgroups.map((s) => {
                        const isIn = m.subgroups.some((ms) => ms.id === s.id);
                        if (!isAdmin && !isIn) return null;
                        return (
                          <button
                            key={s.id}
                            disabled={!isAdmin}
                            onClick={() => toggleMembership(m, s.id, isIn)}
                            title={
                              isAdmin
                                ? isIn
                                  ? `Rimuovi da ${s.name}`
                                  : `Aggiungi a ${s.name}`
                                : undefined
                            }
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                              isIn
                                ? "bg-blue-100 border-blue-300 text-blue-800"
                                : "bg-white border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-600"
                            } ${isAdmin ? "cursor-pointer" : "cursor-default"}`}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
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
