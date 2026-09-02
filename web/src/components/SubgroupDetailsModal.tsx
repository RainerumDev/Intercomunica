import { sortMembers } from "../subgroups";
import type { Subgroup } from "../types";
import SubgroupChip from "./SubgroupChip";
import { useDialogFocus } from "./useDialogFocus";

interface Props {
  subgroup: Subgroup;
  onClose: () => void;
  onEmail: () => void;
}

export default function SubgroupDetailsModal({ subgroup, onClose, onEmail }: Props) {
  const members = sortMembers(subgroup.members);
  const titleId = `subgroup-details-${subgroup.id}`;
  const dialogRef = useDialogFocus({ onClose });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="dialog-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="section-heading">Membri del sottogruppo</h2>
            <p className="field-hint mt-1">{subgroup.folder?.trim() || "Generale"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="text-action text-xl"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          <SubgroupChip subgroup={subgroup} />
        </div>

        <div className="mt-5 max-h-72 overflow-y-auto rounded-lg border border-[var(--line)]">
          {members.length === 0 ? (
            <p className="field-hint px-4 py-8 text-center">Nessun membro nel sottogruppo.</p>
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
          <button type="button" onClick={onClose} className="button button--neutral">
            Chiudi
          </button>
          <button
            type="button"
            onClick={onEmail}
            disabled={members.length === 0}
            className="button button--primary"
          >
            ✉️ Invia email
          </button>
        </div>
      </div>
    </div>
  );
}
