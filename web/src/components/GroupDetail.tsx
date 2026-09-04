import { sortMembers } from "../subgroups";
import type { Subgroup } from "../types";

interface Props {
  subgroup: Subgroup;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onEmail: () => void;
}

function memberInitials(name: string | null, email: string): string {
  const words = name?.trim().split(/\s+/u).filter(Boolean) ?? [];
  const source = words.length > 0 ? words : [email.split("@")[0]];
  return [source[0], source.length > 1 ? source[source.length - 1] : ""]
    .map((word) => word.charAt(0))
    .join("")
    .toLocaleUpperCase("it");
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export default function GroupDetail({ subgroup, isAdmin, onEdit, onDelete, onEmail }: Props) {
  const members = sortMembers(subgroup.members);

  return (
    <section className="surface-card surface-card--padded group-detail" aria-labelledby="group-detail-title">
      <div className="group-detail__header">
        <div>
          <p className="group-detail__eyebrow">{subgroup.folder?.trim() || "Generale"}</p>
          <h2 id="group-detail-title" className="section-heading group-detail__title">{subgroup.name}</h2>
        </div>
        {isAdmin && (
          <div className="group-detail__admin-actions">
            <button type="button" onClick={onEdit} aria-label="Modifica gruppo" title="Modifica gruppo" className="group-detail__icon-button text-action">
              <EditIcon />
            </button>
            <button type="button" onClick={onDelete} aria-label="Elimina gruppo" title="Elimina gruppo" className="group-detail__icon-button text-action text-action--danger">
              <TrashIcon />
            </button>
          </div>
        )}
      </div>

      {subgroup.description?.trim() && <p className="group-detail__description">{subgroup.description}</p>}

      <div className="group-detail__members">
        <h3 className="group-detail__members-title">Membri ({members.length})</h3>
        {members.length === 0 ? (
          <p className="field-hint group-detail__empty">Nessun membro nel gruppo.</p>
        ) : (
          <ul className="group-detail__member-list">
            {members.map((member) => {
              const label = member.name?.trim() || member.email;
              return (
                <li key={member.id} data-testid="group-member" className="group-member-row">
                  <span className="group-member-row__initials" aria-hidden="true">{memberInitials(member.name, member.email)}</span>
                  <span className="group-member-row__text">
                    <span className="group-member-row__name">{label}</span>
                    {member.name?.trim() && <span className="group-member-row__email">{member.email}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onEmail}
        disabled={members.length === 0}
        className="button button--primary button--wide group-detail__email"
      >
        Invia email al gruppo
      </button>
    </section>
  );
}
