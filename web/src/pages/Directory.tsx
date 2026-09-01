import { useEffect, useId, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Member, Subgroup } from "../types";
import EmailComposer from "../components/EmailComposer";
import MemberSubgroupCell from "../components/MemberSubgroupCell";
import { useDialogFocus } from "../components/useDialogFocus";

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
  const [editingSubgroup, setEditingSubgroup] = useState<Subgroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editDialogTitleId = useId();
  const editDialogRef = useDialogFocus({
    active: Boolean(editingSubgroup),
    onClose: () => setEditingSubgroup(null),
  });

  const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );

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

  const updateSubgroup = async (s: Subgroup) => {
    setError(null);
    try {
      await api.put(`/api/subgroups/${s.id}`, { name: s.name.trim(), folder: s.folder?.trim() || null });
      setEditingSubgroup(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleModalAddMember = async (m: Member) => {
    if (!editingSubgroup) return;
    try {
      await api.post(`/api/subgroups/${editingSubgroup.id}/members`, { userId: m.id });
      setEditingSubgroup({
        ...editingSubgroup,
        members: [...editingSubgroup.members, { id: m.id, email: m.email, name: m.name }]
      });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleModalRemoveMember = async (mId: string) => {
    if (!editingSubgroup) return;
    try {
      await api.delete(`/api/subgroups/${editingSubgroup.id}/members/${mId}`);
      setEditingSubgroup({
        ...editingSubgroup,
        members: editingSubgroup.members.filter(x => x.id !== mId)
      });
      reload();
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
    <div className="page">
      <h1 className="page-heading">Gruppi & Docenti</h1>
      {error && <p role="alert" className="feedback feedback--error">{error}</p>}

      {/* Sottogruppi (Flusso 2.1 + Flusso 4) */}
      <section>
        <div className="section-toolbar mb-3">
          <h2 className="section-heading">Sottogruppi</h2>
          <input
            value={subgroupQ}
            onChange={(e) => setSubgroupQ(e.target.value)}
            placeholder="Cerca sottogruppo…"
            className="form-control w-72"
          />
        </div>
        <div className="space-y-6">
          {Object.entries(groupedSubgroups).sort().map(([folder, list]) => (
            <div key={folder}>
              <h3 className="section-heading mb-2 border-b border-[var(--line)] pb-1">{folder}</h3>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {list.map((s) => (
                  <div key={s.id} className="surface-card surface-card--interactive flex flex-col justify-between p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate flex-1">
                        <h4 className="text-sm font-medium text-gray-900 truncate" title={s.name}>{s.name}</h4>
                        <p className="text-xs text-gray-500">{s.members.length} membri</p>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-2 shrink-0 mt-0.5">
                          <button
                            onClick={() => setEditingSubgroup(s)}
                            title="Modifica sottogruppo"
                            className="text-action"
                          >
                            <EditIcon />
                          </button>
                          <button
                            onClick={() => deleteSubgroup(s)}
                            title="Elimina sottogruppo"
                            className="text-action text-action--danger"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setEmailTarget(s)}
                      disabled={s.members.length === 0}
                      className="button button--secondary button--small button--wide mt-2.5"
                    >
                      ✉️ Invia Email
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {isAdmin && subgroupQ.trim() === "" && (
            <div className="surface-card surface-card--padded mt-6 max-w-xl border-dashed">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Aggiungi nuovo sottogruppo</h4>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={newSubgroup}
                  onChange={(e) => setNewSubgroup(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newSubgroup.trim() && createSubgroup()}
                  placeholder="Nome (es. 1A)"
                  className="form-control flex-1"
                />
                <input
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newSubgroup.trim() && createSubgroup()}
                  placeholder="Cartella (opzionale)"
                  className="form-control flex-1"
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
                  className="button button--primary shrink-0"
                >
                  + Crea
                </button>
              </div>
            </div>
          )}
        </div>
        {filteredSubgroups.length === 0 && (
          <p className="field-hint py-4 text-sm">
            {subgroups.length === 0
              ? "Nessun sottogruppo definito."
              : "Nessun sottogruppo corrisponde alla ricerca."}
          </p>
        )}
      </section>

      {/* Anagrafica (Flusso 2.2) */}
      <section>
        <div className="section-toolbar mb-3">
          <h2 className="section-heading">Docenti</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per nome, email o sottogruppo…"
            className="form-control w-72"
          />
        </div>
        <div className="table-shell">
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
                  <td colSpan={2} className="field-hint px-4 py-8 text-center">
                    Nessun docente trovato. {members.length === 0 && "Esegui la sincronizzazione dalle Impostazioni."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {emailTarget && <EmailComposer subgroup={emailTarget} onClose={() => setEmailTarget(null)} />}

      {editingSubgroup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setEditingSubgroup(null)}>
          <div
            ref={editDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={editDialogTitleId}
            tabIndex={-1}
            className="dialog-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id={editDialogTitleId} className="section-heading">Modifica sottogruppo</h2>
              <button
                aria-label="Chiudi modifica sottogruppo"
                onClick={() => setEditingSubgroup(null)}
                className="text-action text-xl"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <input
                value={editingSubgroup.name}
                onChange={(e) => setEditingSubgroup({ ...editingSubgroup, name: e.target.value })}
                placeholder="Nome *"
                className="form-control"
              />
              <input
                value={editingSubgroup.folder || ""}
                onChange={(e) => setEditingSubgroup({ ...editingSubgroup, folder: e.target.value })}
                placeholder="Cartella (opzionale)"
                className="form-control"
                list="folders"
              />
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Membri del gruppo</h3>
                <div className="max-h-60 overflow-y-auto space-y-1 pr-2 text-sm">
                  {editingSubgroup.members.map(m => (
                    <div key={m.id} className="flex justify-between items-center py-1">
                      <span className="truncate" title={m.email}>{m.name || m.email}</span>
                      <button onClick={() => handleModalRemoveMember(m.id)} className="text-red-600 hover:text-red-800 ml-2 shrink-0">Rimuovi</button>
                    </div>
                  ))}
                  {editingSubgroup.members.length === 0 && <p className="field-hint py-1 text-xs">Nessun docente in questo gruppo.</p>}
                  
                  <h3 className="text-sm font-semibold text-gray-700 mt-4 mb-2">Altri docenti</h3>
                  {members.filter(m => !editingSubgroup.members.some(em => em.id === m.id)).map(m => (
                    <div key={m.id} className="flex justify-between items-center py-1">
                      <span className="truncate text-gray-500" title={m.email}>{m.name || m.email}</span>
                      <button onClick={() => handleModalAddMember(m)} className="text-action ml-2 shrink-0">Aggiungi</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditingSubgroup(null)}
                  className="button button--neutral"
                >
                  Annulla
                </button>
                <button
                  onClick={() => updateSubgroup(editingSubgroup)}
                  disabled={!editingSubgroup.name.trim()}
                  className="button button--primary"
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
