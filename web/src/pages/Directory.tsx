import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Member, Subgroup } from "../types";
import DirectoryTabs from "../components/DirectoryTabs";
import EmailComposer from "../components/EmailComposer";
import GroupDetail from "../components/GroupDetail";
import GroupDirectory, { type GroupDirectorySection } from "../components/GroupDirectory";
import SubgroupChip from "../components/SubgroupChip";
import SubgroupDetailsModal from "../components/SubgroupDetailsModal";
import TeacherDetail from "../components/TeacherDetail";
import TeacherDirectory from "../components/TeacherDirectory";
import { buildDirectorySections, normalizeColorOverride, sortMembers, sortSubgroups } from "../subgroups";
import { useDialogFocus } from "../components/useDialogFocus";
import {
  filterTeachers,
  groupTeachersAlphabetically,
  parseDirectoryTab,
  type DirectoryTab,
  type TeacherScope,
} from "../directory";
import { normalizeSearchText } from "../search";

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
  const [creatingSubgroup, setCreatingSubgroup] = useState(false);
  const [editingSubgroup, setEditingSubgroup] = useState<Subgroup | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const listScrollOffsetRef = useRef(0);
  const mobileDetailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileBackRef = useRef<HTMLButtonElement>(null);
  const newSubgroupInputRef = useRef<HTMLInputElement>(null);
  const editDialogTitleId = useId();
  const editDialogRef = useDialogFocus({
    active: Boolean(editingSubgroup),
    onClose: () => setEditingSubgroup(null),
  });

  const reload = async () => {
    const [m, s] = await Promise.all([
      api.get<Member[]>("/api/users"),
      api.get<Subgroup[]>("/api/subgroups"),
    ]);
    setMembers(m);
    setSubgroups(s);
  };

  useEffect(() => {
    reload()
      .then(() => setLoadState("success"))
      .catch((e: Error) => {
        setError(e.message);
        setLoadState("error");
      });
  }, []);

  useEffect(() => {
    setMobileDetailOpen(false);
  }, [tab]);

  const directoryUser = useMemo(() => {
    if (!me) return null;
    const refreshedUser = members.find(({ id }) => id === me.id);
    return refreshedUser ? { ...me, subgroups: refreshedUser.subgroups } : me;
  }, [me, members]);

  const filtered = useMemo(
    () => directoryUser ? filterTeachers(members, teacherQuery, teacherScope, directoryUser) : [],
    [directoryUser, members, teacherQuery, teacherScope]
  );

  const groupedTeachers = useMemo(
    () => groupTeachersAlphabetically(filtered),
    [filtered]
  );

  const filteredSubgroups = useMemo(() => {
    const needle = normalizeSearchText(groupQuery);
    if (!needle) return subgroups;
    return subgroups.filter((s) => normalizeSearchText(`${s.name} ${s.folder ?? ""}`).includes(needle));
  }, [subgroups, groupQuery]);

  const groupSections = useMemo(() => {
    const derivedLabels = new Map<string, string>();
    for (const section of buildDirectorySections(members, filteredSubgroups)) {
      if (section.kind === "folder") {
        section.groups.forEach(({ subgroup }) => derivedLabels.set(subgroup.id, section.label));
      }
    }

    const sections = new Map<string, GroupDirectorySection>();
    for (const subgroup of sortSubgroups(filteredSubgroups)) {
      const label = derivedLabels.get(subgroup.id) || subgroup.folder?.trim() || "Generale";
      const section = sections.get(label) ?? { label, groups: [] };
      section.groups.push(subgroup);
      sections.set(label, section);
    }
    return [...sections.values()];
  }, [filteredSubgroups, members]);

  const selectedMember = filtered.find(({ id }) => id === selectedMemberId) ?? filtered[0] ?? null;
  const selectedSubgroupForPane = filteredSubgroups.find(({ id }) => id === selectedSubgroupId)
    ?? filteredSubgroups[0]
    ?? null;

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
      setCreatingSubgroup(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openSubgroupCreation = () => {
    setCreatingSubgroup(true);
    window.requestAnimationFrame(() => newSubgroupInputRef.current?.focus());
  };

  const updateSubgroup = async (s: Subgroup) => {
    setError(null);
    try {
      await api.put(`/api/subgroups/${s.id}`, {
        name: s.name.trim(),
        description: s.description?.trim() || null,
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
      {loadState === "loading" ? (
        <p role="status" aria-live="polite" className="portal-status">Caricamento rubrica…</p>
      ) : loadState === "error" ? (
        <p role="alert" className="feedback feedback--error">{error}</p>
      ) : (
        <>
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
                <div className="section-toolbar directory-section-toolbar mb-3">
                  <div className="directory-section-toolbar__heading">
                    <h2 id="directory-groups-title" className="section-heading">Gruppi</h2>
                    {isAdmin && (
                      <button
                        type="button"
                        aria-label="Nuovo gruppo"
                        aria-controls="directory-create-group"
                        aria-expanded={creatingSubgroup}
                        onClick={openSubgroupCreation}
                        className="button button--primary directory-create-command"
                      >
                        <span aria-hidden="true">+</span>
                        <span className="directory-create-command__label">Nuovo gruppo</span>
                      </button>
                    )}
                  </div>
                  <div className="search-control directory-search-control">
                    <input
                      type="search"
                      aria-label="Cerca gruppi"
                      value={groupQuery}
                      onChange={(e) => setGroupQuery(e.target.value)}
                      placeholder="Cerca gruppo…"
                      className="form-control"
                    />
                    {groupQuery && (
                      <button type="button" onClick={() => setGroupQuery("")} className="text-action">
                        Cancella ricerca gruppi
                      </button>
                    )}
                  </div>
                </div>
                {isAdmin && creatingSubgroup && (
                  <div id="directory-create-group" className="surface-card surface-card--padded directory-create-form border-dashed">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Aggiungi nuovo sottogruppo</h3>
                    <div className="flex flex-col gap-2">
                      <input
                        ref={newSubgroupInputRef}
                        aria-label="Nome del nuovo gruppo"
                        value={newSubgroup}
                        onChange={(e) => setNewSubgroup(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && newSubgroup.trim() && createSubgroup()}
                        placeholder="Nome (es. 1A)"
                        className="form-control flex-1"
                      />
                      <input
                        aria-label="Cartella del nuovo gruppo"
                        value={newFolder}
                        onChange={(e) => setNewFolder(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && newSubgroup.trim() && createSubgroup()}
                        placeholder="Cartella (opzionale)"
                        className="form-control flex-1"
                        list="folders"
                      />
                      <datalist id="folders">
                        {groupSections.map(({ label }) => <option key={label} value={label} />)}
                      </datalist>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setCreatingSubgroup(false)} className="button button--neutral">Annulla</button>
                        <button type="button" onClick={createSubgroup} disabled={!newSubgroup.trim()} className="button button--primary">Crea gruppo</button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-6">
                  <GroupDirectory
                    sections={groupSections}
                    selectedId={selectedSubgroupForPane?.id ?? null}
                    onSelect={selectSubgroup}
                  />
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
                  <div className="search-control directory-search-control">
                    <input
                      type="search"
                      aria-label="Cerca docenti"
                      value={teacherQuery}
                      onChange={(e) => setTeacherQuery(e.target.value)}
                      placeholder="Cerca per nome, email o sottogruppo…"
                      className="form-control"
                    />
                    {teacherQuery && (
                      <button type="button" onClick={() => setTeacherQuery("")} className="text-action">
                        Cancella ricerca docenti
                      </button>
                    )}
                  </div>
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
            <GroupDetail
              subgroup={selectedSubgroupForPane}
              isAdmin={isAdmin}
              onEdit={() => setEditingSubgroup(selectedSubgroupForPane)}
              onDelete={() => deleteSubgroup(selectedSubgroupForPane)}
              onEmail={() => setEmailTarget(selectedSubgroupForPane)}
            />
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
              <textarea
                aria-label="Descrizione"
                value={editingSubgroup.description || ""}
                onChange={(e) => setEditingSubgroup({ ...editingSubgroup, description: e.target.value })}
                placeholder="Descrizione (opzionale)"
                rows={3}
                className="form-control"
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
        </>
      )}
    </div>
  );
}
