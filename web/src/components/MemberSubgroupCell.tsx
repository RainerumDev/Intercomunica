import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Member, Subgroup } from "../types";
import { sortSubgroups } from "../subgroups";
import SubgroupChip from "./SubgroupChip";

interface Props {
  member: Member;
  allSubgroups: Subgroup[];
  isAdmin: boolean;
  onAdd: (member: Member, subgroupId: string) => void;
  onRemove: (member: Member, subgroupId: string) => void;
  onInspect?: (subgroupId: string) => void;
}

/**
 * Directory row cell: shows the subgroups a teacher belongs to as chips.
 * For admins each chip is removable and a "+" button opens a searchable
 * picker of the remaining subgroups. The picker is rendered in a portal with
 * fixed positioning so the surrounding table's overflow can't clip it.
 */
export default function MemberSubgroupCell({ member, allSubgroups, isAdmin, onAdd, onRemove, onInspect }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const available = useMemo(() => {
    const inIds = new Set(member.subgroups.map((s) => s.id));
    const needle = q.trim().toLowerCase();
    return sortSubgroups(allSubgroups)
      .filter((s) => !inIds.has(s.id))
      .filter((s) => !needle || s.name.toLowerCase().includes(needle));
  }, [allSubgroups, member.subgroups, q]);

  const place = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const popupHeight = 260; // stima dell'altezza massima
      if (rect.bottom + popupHeight > window.innerHeight) {
        setPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
      } else {
        setPos({ top: rect.bottom + 4, left: rect.left });
      }
    }
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  // reposition / dismiss on scroll or resize; close on outside click & Escape
  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => place();
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
    else setQ("");
  }, [open]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {member.subgroups.length === 0 && !isAdmin && (
        <span className="text-xs text-gray-400">Nessun sottogruppo</span>
      )}

      {sortSubgroups(member.subgroups).map((s) => (
        isAdmin ? (
          <SubgroupChip key={s.id} subgroup={s}>
            {s.name}
            <button
              type="button"
              onClick={() => onRemove(member, s.id)}
              title={`Rimuovi da ${s.name}`}
              className="rounded-full leading-none opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-current"
            >
              ×
            </button>
          </SubgroupChip>
        ) : (
          <SubgroupChip key={s.id} subgroup={s} interactive onClick={() => onInspect?.(s.id)} />
        )
      ))}

      {isAdmin && (
        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          title="Aggiungi a un sottogruppo"
          className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 text-sm leading-none"
        >
          +
        </button>
      )}

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: pos.top !== undefined ? pos.top : "auto",
              bottom: pos.bottom !== undefined ? pos.bottom : "auto",
              left: pos.left,
            }}
            className="z-50 w-64 rounded-lg border border-gray-200 bg-white shadow-lg p-2"
          >
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca sottogruppo…"
              className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm mb-2"
            />
            <div className="max-h-56 overflow-y-auto">
              {available.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-gray-400">
                  {allSubgroups.length === member.subgroups.length
                    ? "Già in tutti i sottogruppi"
                    : "Nessun sottogruppo trovato"}
                </p>
              ) : (
                available.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onAdd(member, s.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-blue-50"
                  >
                    <span className="text-blue-600">+</span>
                    {s.name}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
