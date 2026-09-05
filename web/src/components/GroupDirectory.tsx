import { useId } from "react";
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
  const idPrefix = useId().replace(/:/gu, "");

  return (
    <div className="group-directory">
      {sections.map((section, sectionIndex) => {
        const headingId = `${idPrefix}-group-folder-${sectionIndex}`;
        return (
          <section key={section.label} className="group-directory__section" aria-labelledby={headingId}>
            <h3 id={headingId} className="group-directory__heading">{section.label}</h3>
            <div className="group-directory__rows">
              {section.groups.map((subgroup, subgroupIndex) => {
                const colors = subgroupColors(subgroup.name, subgroup.color);
                const rowId = `${idPrefix}-group-${sectionIndex}-${subgroupIndex}`;
                const nameId = `${rowId}-name`;
                const descriptionId = `${rowId}-description`;
                const countId = `${rowId}-count`;
                return (
                  <button
                    key={subgroup.id}
                    type="button"
                    className="group-directory-row"
                    aria-labelledby={nameId}
                    aria-describedby={`${descriptionId} ${countId}`}
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
                      <span id={nameId} className="group-directory-row__name">{subgroup.name}</span>
                      <span id={descriptionId} className="group-directory-row__description">
                        {subgroup.description?.trim() || subgroup.folder?.trim() || "Generale"}
                      </span>
                    </span>
                    <span id={countId} className="group-directory-row__count">
                      {subgroup.members.length} {subgroup.members.length === 1 ? "membro" : "membri"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
