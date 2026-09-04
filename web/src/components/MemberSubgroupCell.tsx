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
      const gutter = 8;
      const popupWidth = Math.min(panelRef.current?.offsetWidth || 256, window.innerWidth - gutter * 2);
      const left = Math.min(Math.max(rect.left, gutter), Math.max(gutter, window.innerWidth - popupWidth - gutter));
      if (rect.bottom + popupHeight > window.innerHeight) {
        setPos({ bottom: window.innerHeight - rect.top + 4, left });
      } else {
        setPos({ top: rect.bottom + 4, left });
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
        <span className="field-hint text-xs">Nessun sottogruppo</span>
      )}

      {sortSubgroups(member.subgroups).map((s) => (
        isAdmin ? (
          <SubgroupChip key={s.id} subgroup={s}>
            {onInspect ? (
              <button
                type="button"
                onClick={() => onInspect(s.id)}
                aria-label={`Mostra i membri di ${s.name}`}
                className="rounded-full font-medium focus:outline-none focus:ring-1 focus:ring-current"
              >
                {s.name}
              </button>
            ) : s.name}
            <button
              type="button"
              onClick={() => onRemove(member, s.id)}
              title={`Rimuovi da ${s.name}`}
              aria-label={`Rimuovi da ${s.name}`}
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
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Aggiungi a un sottogruppo"
          aria-label="Aggiungi a un sottogruppo"
          className="text-action inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[var(--line-strong)] text-sm leading-none"
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
              maxWidth: "calc(100vw - 1rem)",
            }}
            className="popover-panel"
          >
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca sottogruppo…"
              className="form-control mb-2"
            />
            <div className="max-h-56 overflow-y-auto">
              {available.length === 0 ? (
                <p className="field-hint px-2 py-3 text-center text-xs">
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
                    className="popover-panel__option"
                  >
                    <span className="text-action">+</span>
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
