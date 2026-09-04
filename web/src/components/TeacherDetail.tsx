import type { Member, Subgroup } from "../types";
import MemberSubgroupCell from "./MemberSubgroupCell";

interface Props {
  member: Member;
  isAdmin: boolean;
  allSubgroups: Subgroup[];
  onAdd: (member: Member, subgroupId: string) => void;
  onRemove: (member: Member, subgroupId: string) => void;
  onInspect: (subgroupId: string) => void;
}

export default function TeacherDetail({ member, isAdmin, allSubgroups, onAdd, onRemove, onInspect }: Props) {
  const label = member.name?.trim() || member.email;

  return (
    <section className="surface-card surface-card--padded teacher-detail" aria-labelledby="teacher-detail-title">
      <p className="teacher-detail__eyebrow">Docente</p>
      <h2 id="teacher-detail-title" className="section-heading teacher-detail__title">{label}</h2>
      <a className="teacher-detail__email text-action" href={`mailto:${member.email}`}>{member.email}</a>

      <div className="teacher-detail__groups">
        <h3 className="teacher-detail__groups-title">Gruppi assegnati</h3>
        {!isAdmin && member.subgroups.length === 0 ? (
          <p className="field-hint text-sm">Nessun gruppo assegnato.</p>
        ) : (
          <MemberSubgroupCell
            member={member}
            allSubgroups={allSubgroups}
            isAdmin={isAdmin}
            onAdd={onAdd}
            onRemove={onRemove}
            onInspect={onInspect}
          />
        )}
      </div>
    </section>
  );
}
