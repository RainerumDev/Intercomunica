import { useEffect } from "react";
import { sortMembers } from "../subgroups";
import type { Subgroup } from "../types";
import SubgroupChip from "./SubgroupChip";

interface Props {
  subgroup: Subgroup;
  onClose: () => void;
  onEmail: () => void;
}

export default function SubgroupDetailsModal({ subgroup, onClose, onEmail }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const members = sortMembers(subgroup.members);
  const titleId = `subgroup-details-${subgroup.id}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">Membri del sottogruppo</h2>
            <p className="mt-1 text-sm text-gray-500">{subgroup.folder?.trim() || "Generale"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          <SubgroupChip subgroup={subgroup} />
        </div>

        <div className="mt-5 max-h-72 overflow-y-auto rounded-lg border border-gray-200">
          {members.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Nessun membro nel sottogruppo.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {members.map((member) => (
                <li key={member.id} className="px-4 py-3">
                  <p className="font-medium text-gray-900">{member.name?.trim() || member.email}</p>
                  {member.name?.trim() && <p className="text-sm text-gray-500">{member.email}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Chiudi
          </button>
          <button
            type="button"
            onClick={onEmail}
            disabled={members.length === 0}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-40"
          >
            ✉️ Invia email
          </button>
        </div>
      </div>
    </div>
  );
}
