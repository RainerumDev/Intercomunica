import type { KeyboardEvent } from "react";
import type { DirectoryTab } from "../directory";

interface DirectoryTabsProps {
  tab: DirectoryTab;
  teacherCount: number;
  groupCount: number;
  onChange: (tab: DirectoryTab) => void;
}

const tabs: Array<{ value: DirectoryTab; label: string }> = [
  { value: "teachers", label: "Docenti" },
  { value: "groups", label: "Gruppi" },
];

export default function DirectoryTabs({
  tab,
  teacherCount,
  groupCount,
  onChange,
}: DirectoryTabsProps) {
  const counts: Record<DirectoryTab, number> = {
    teachers: teacherCount,
    groups: groupCount,
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: DirectoryTab
  ) => {
    const currentIndex = tabs.findIndex(({ value }) => value === currentTab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex].value;
    const nextButton = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
      `#directory-tab-${nextTab}`
    );
    nextButton?.focus();
    onChange(nextTab);
  };

  return (
    <div className="directory-tabs" role="tablist" aria-label="Sezioni della rubrica">
      {tabs.map(({ value, label }) => (
        <button
          key={value}
          id={`directory-tab-${value}`}
          type="button"
          role="tab"
          aria-label={`${label} ${counts[value]}`}
          aria-selected={tab === value}
          aria-controls={`directory-panel-${value}`}
          tabIndex={tab === value ? 0 : -1}
          className="directory-tabs__tab"
          onClick={() => onChange(value)}
          onKeyDown={(event) => handleKeyDown(event, value)}
        >
          <span>{label}</span>
          <span className="directory-tabs__count">{counts[value]}</span>
        </button>
      ))}
    </div>
  );
}
