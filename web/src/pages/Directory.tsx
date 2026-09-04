import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Member, Subgroup } from "../types";
import DirectoryTabs from "../components/DirectoryTabs";
import EmailComposer from "../components/EmailComposer";
import SubgroupChip from "../components/SubgroupChip";
import SubgroupDetailsModal from "../components/SubgroupDetailsModal";
import TeacherDetail from "../components/TeacherDetail";
import TeacherDirectory from "../components/TeacherDirectory";
import { normalizeColorOverride, sortMembers, sortSubgroups } from "../subgroups";
import { useDialogFocus } from "../components/useDialogFocus";
import {
  filterTeachers,
  groupTeachersAlphabetically,
  parseDirectoryTab,
  type DirectoryTab,
  type TeacherScope,
} from "../directory";

export default function Directory() {
  const { me } = useAuth();
  const isAdmin = me?.role === "ADMIN";
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseDirectoryTab(searchParams.get("tab"));
  const [members, setMembers] = useState<Member[]>([]);
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedSubgroupId, setSelectedSubgroupId] = useState<string | null>(null);
  const [teacherQuery, setTeacherQuery] = useState("");
  const [teacherScope, setTeacherScope] = useState<TeacherScope>("all");
  const [groupQuery, setGroupQuery] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState<Subgroup | null>(null);
  const [selectedSubgroup, setSelectedSubgroup] = useState<Subgroup | null>(null);
  const [newSubgroup, setNewSubgroup] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [editingSubgroup, setEditingSubgroup] = useState<Subgroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listScrollOffsetRef = useRef(0);
  const mobileDetailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileBackRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    setMobileDetailOpen(false);
  }, [tab]);

  const filtered = useMemo(
    () => me ? filterTeachers(members, teacherQuery, teacherScope, me) : [],
    [me, members, teacherQuery, teacherScope]
  );

  const groupedTeachers = useMemo(
    () => groupTeachersAlphabetically(filtered),
    [filtered]
  );

  const filteredSubgroups = useMemo(() => {
    const needle = groupQuery.trim().toLowerCase();
    if (!needle) return subgroups;
    return subgroups.filter((s) => s.name.toLowerCase().includes(needle) || (s.folder?.toLowerCase() ?? "").includes(needle));
  }, [subgroups, groupQuery]);

  const groupedSubgroups = useMemo(() => {
    const groups: Record<string, Subgroup[]> = {};
    sortSubgroups(filteredSubgroups).forEach(s => {
      const folder = s.folder?.trim() || "Generale";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(s);
    });
    return groups;
  }, [filteredSubgroups]);

  const selectedMember = filtered.find(({ id }) => id === selectedMemberId) ?? filtered[0] ?? null;
  const selectedSubgroupForPane = subgroups.find(({ id }) => id === selectedSubgroupId) ?? null;

  const openMobileDetail = (trigger: HTMLButtonElement) => {
    if (mobileDetailOpen) return;
    listScrollOffsetRef.current = window.scrollY;
    mobileDetailTriggerRef.current = trigger;
    setMobileDetailOpen(true);
    const isMobile = typeof window.matchMedia !== "function"
      || window.matchMedia("(max-width: 1023px)").matches;
    if (isMobile) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
        mobileBackRef.current?.focus();
      });
    }
  };

  const selectMember = (memberId: string, trigger: HTMLButtonElement) => {
    setSelectedMemberId(memberId);
    openMobileDetail(trigger);
  };

  const selectSubgroup = (subgroupId: string, trigger: HTMLButtonElement) => {
    setSelectedSubgroupId(subgroupId);
    openMobileDetail(trigger);
  };

  const closeMobileDetail = () => {
    setMobileDetailOpen(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: listScrollOffsetRef.current, behavior: "auto" });
      mobileDetailTriggerRef.current?.focus();
    });
  };

  const changeTab = (nextTab: DirectoryTab) => {
    setMobileDetailOpen(false);
    setSearchParams({ tab: nextTab });
  };

  const inspectSubgroup = (subgroupId: string) => {
    const subgroup = subgroups.find((entry) => entry.id === subgroupId);
    if (subgroup) setSelectedSubgroup(subgroup);
  };

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
      await api.put(`/api/subgroups/${s.id}`, {
        name: s.name.trim(),
        folder: s.folder?.trim() || null,
        color: normalizeColorOverride(s.color),
      });
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
    <div className="page page--directory">
      <h1 className="page-heading">Rubrica</h1>
      {error && <p role="alert" className="feedback feedback--error">{error}</p>}

      <div
        className={`directory-layout${mobileDetailOpen ? " directory-layout--detail-open" : ""}`}
        data-testid="directory-layout"
      >
        <div className="directory-master">
          <DirectoryTabs
            tab={tab}
            teacherCount={members.length}
            groupCount={subgroups.length}
            onChange={changeTab}
          />

          <div
            id="directory-panel-groups"
            role="tabpanel"
            aria-labelledby="directory-tab-groups"
            hidden={tab !== "groups"}
            className="directory-list-pane"
            data-testid={tab === "groups" ? "directory-list-pane" : undefined}
          >
            <section aria-labelledby="directory-groups-title">
                <div className="section-toolbar mb-3">
                  <h2 id="directory-groups-title" className="section-heading">Gruppi</h2>
                  <input
                    type="search"
                    aria-label="Cerca gruppi"
                    value={groupQuery}
                    onChange={(e) => setGroupQuery(e.target.value)}
                    placeholder="Cerca gruppo…"
                    className="form-control"
                  />
                </div>
                <div className="space-y-6">
                  {Object.entries(groupedSubgroups).map(([folder, list]) => (
                    <div key={folder}>
                      <h3 className="section-heading mb-2 border-b border-[var(--line)] pb-1">{folder}</h3>
                      <div className="grid gap-2 grid-cols-1">
                        {list.map((s) => (
                          <div key={s.id} className="surface-card surface-card--interactive flex flex-col justify-between p-3">
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={(event) => selectSubgroup(s.id, event.currentTarget)}
                                className="min-w-0 flex-1 rounded-md p-1 text-left focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
                                aria-label={`Mostra dettagli di ${s.name}`}
                                aria-pressed={selectedSubgroupId === s.id}
                              >
                                <SubgroupChip subgroup={s} />
                                <span className="mt-1 block text-xs text-gray-500">{s.members.length} membri</span>
                              </button>
                              {isAdmin && (
                                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                  <button type="button" onClick={() => setEditingSubgroup(s)} title="Modifica sottogruppo" className="text-action">
                                    <EditIcon />
                                  </button>
                                  <button type="button" onClick={() => deleteSubgroup(s)} title="Elimina sottogruppo" className="text-action text-action--danger">
                                    <TrashIcon />
                                  </button>
                                </div>
                              )}
                            </div>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setEmailTarget(s)}
                                disabled={s.members.length === 0}
                                className="button button--secondary button--small button--wide mt-2.5"
                              >
                                ✉️ Invia Email
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {isAdmin && groupQuery.trim() === "" && (
                    <div className="surface-card surface-card--padded mt-6 border-dashed">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Aggiungi nuovo sottogruppo</h4>
                      <div className="flex flex-col gap-2">
                        <input value={newSubgroup} onChange={(e) => setNewSubgroup(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newSubgroup.trim() && createSubgroup()} placeholder="Nome (es. 1A)" className="form-control flex-1" />
                        <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newSubgroup.trim() && createSubgroup()} placeholder="Cartella (opzionale)" className="form-control flex-1" list="folders" />
                        <datalist id="folders">
                          {Object.keys(groupedSubgroups).map((folder) => <option key={folder} value={folder} />)}
                        </datalist>
                        <button onClick={createSubgroup} disabled={!newSubgroup.trim()} className="button button--primary shrink-0">+ Crea</button>
                      </div>
                    </div>
                  )}
                </div>
                {filteredSubgroups.length === 0 && (
                  <p className="field-hint py-4 text-sm">
                    {subgroups.length === 0 ? "Nessun sottogruppo definito." : "Nessun sottogruppo corrisponde alla ricerca."}
                  </p>
                )}
            </section>
          </div>

          <div
            id="directory-panel-teachers"
            role="tabpanel"
            aria-labelledby="directory-tab-teachers"
            hidden={tab !== "teachers"}
            className="directory-list-pane"
            data-testid={tab === "teachers" ? "directory-list-pane" : undefined}
          >
            <section aria-labelledby="directory-teachers-title">
                <div className="section-toolbar mb-3">
                  <h2 id="directory-teachers-title" className="section-heading">Docenti</h2>
                  <input
                    type="search"
                    aria-label="Cerca docenti"
                    value={teacherQuery}
                    onChange={(e) => setTeacherQuery(e.target.value)}
                    placeholder="Cerca per nome, email o sottogruppo…"
                    className="form-control"
                  />
                </div>
                <TeacherDirectory
                  groups={groupedTeachers}
                  selectedId={selectedMember?.id ?? null}
                  scope={teacherScope}
                  onScopeChange={setTeacherScope}
                  onSelect={selectMember}
                />
            </section>
          </div>
        </div>

        <aside className="directory-detail-pane" aria-live="polite">
          <button ref={mobileBackRef} type="button" className="directory-detail-pane__back text-action" onClick={closeMobileDetail}>
            {tab === "teachers" ? "Torna a tutti i docenti" : "Torna a tutti i gruppi"}
          </button>
          {tab === "teachers" && selectedMember ? (
            <TeacherDetail
              member={selectedMember}
              isAdmin={isAdmin}
              allSubgroups={subgroups}
              onAdd={addMembership}
              onRemove={removeMembership}
              onInspect={inspectSubgroup}
            />
          ) : tab === "groups" && selectedSubgroupForPane ? (
            <section className="surface-card surface-card--padded">
              <h2 className="section-heading mb-3">{selectedSubgroupForPane.name}</h2>
              <SubgroupChip subgroup={selectedSubgroupForPane} />
              <p className="mt-2 text-sm text-gray-500">{selectedSubgroupForPane.members.length} membri</p>
              <button type="button" className="button button--secondary button--small mt-3" onClick={() => setSelectedSubgroup(selectedSubgroupForPane)}>
                Mostra i membri
              </button>
            </section>
          ) : (
            <p className="surface-card field-hint directory-empty">
              {tab === "teachers" ? "Seleziona un docente per vedere i dettagli." : "Seleziona un gruppo per vedere i dettagli."}
            </p>
          )}
        </aside>
      </div>

      {selectedSubgroup && (
        <SubgroupDetailsModal
          subgroup={selectedSubgroup}
          onClose={() => setSelectedSubgroup(null)}
          onEmail={() => {
            setEmailTarget(selectedSubgroup);
            setSelectedSubgroup(null);
          }}
        />
      )}

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

              <div className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Colore etichetta</p>
                    <p className="text-xs text-gray-500">{editingSubgroup.color ? "Personalizzato" : "Automatico dal nome"}</p>
                  </div>
                  <input
                    type="color"
                    value={editingSubgroup.color ?? "#1D4ED8"}
                    onChange={(e) => setEditingSubgroup({ ...editingSubgroup, color: e.target.value.toUpperCase() })}
                    aria-label="Colore del sottogruppo"
                    className="h-10 w-14 cursor-pointer rounded border border-gray-300 bg-white p-1"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <SubgroupChip subgroup={editingSubgroup} />
                  <button
                    type="button"
                    onClick={() => setEditingSubgroup({ ...editingSubgroup, color: null })}
                    className="text-xs font-medium text-blue-700 hover:text-blue-900"
                  >
                    Usa colore automatico
                  </button>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Membri del gruppo</h3>
                <div className="max-h-60 overflow-y-auto space-y-1 pr-2 text-sm">
                  {sortMembers(editingSubgroup.members).map(m => (
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
