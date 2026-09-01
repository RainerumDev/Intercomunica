import type { ReactNode } from "react";
import { subgroupColors, type SubgroupRef } from "../subgroups";

interface Props {
  subgroup: SubgroupRef;
  interactive?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
}

export default function SubgroupChip({ subgroup, interactive, onClick, children, className = "" }: Props) {
  const colors = subgroupColors(subgroup.name, subgroup.color);
  const common = `inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`;
  const style = {
    backgroundColor: colors.background,
    borderColor: colors.border,
    color: colors.foreground,
  };
  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${common} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1`}
        style={style}
        aria-label={`Mostra i membri di ${subgroup.name}`}
      >
        {children ?? subgroup.name}
      </button>
    );
  }
  return (
    <span className={common} style={style}>
      {children ?? subgroup.name}
    </span>
  );
}
