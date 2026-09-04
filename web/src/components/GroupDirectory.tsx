import { subgroupColors } from "../subgroups";
import type { Subgroup } from "../types";

export interface GroupDirectorySection {
  label: string;
  groups: Subgroup[];
}

interface Props {
  sections: GroupDirectorySection[];
  selectedId: string | null;
  onSelect: (subgroupId: string, trigger: HTMLButtonElement) => void;
}

export default function GroupDirectory({ sections, selectedId, onSelect }: Props) {
  return (
    <div className="group-directory">
      {sections.map((section) => (
        <section key={section.label} className="group-directory__section" aria-labelledby={`group-folder-${section.label}`}>
          <h3 id={`group-folder-${section.label}`} className="group-directory__heading">{section.label}</h3>
          <div className="group-directory__rows">
            {section.groups.map((subgroup) => {
              const colors = subgroupColors(subgroup.name, subgroup.color);
              return (
                <button
                  key={subgroup.id}
                  type="button"
                  className="group-directory-row"
                  aria-label={`Mostra dettagli di ${subgroup.name}`}
                  aria-pressed={selectedId === subgroup.id}
                  onClick={(event) => onSelect(subgroup.id, event.currentTarget)}
                >
                  <span
                    data-testid="group-color-indicator"
                    className="group-directory-row__color"
                    style={{ backgroundColor: colors.background }}
                    aria-hidden="true"
                  />
                  <span className="group-directory-row__body">
                    <span className="group-directory-row__name">{subgroup.name}</span>
                    <span className="group-directory-row__description">
                      {subgroup.description?.trim() || subgroup.folder?.trim() || "Generale"}
                    </span>
                  </span>
                  <span className="group-directory-row__count">
                    {subgroup.members.length} {subgroup.members.length === 1 ? "membro" : "membri"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
