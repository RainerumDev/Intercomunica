import { normalizeSearchText } from "./search";
import { sortMembers, subgroupSchoolLevel } from "./subgroups";
import type { Me, Member } from "./types";

export type DirectoryTab = "teachers" | "groups";
export type TeacherScope = "all" | "middle" | "upper" | "mine";

export interface TeacherLetterGroup {
  letter: string;
  members: Member[];
}

export function parseDirectoryTab(value: string | null): DirectoryTab {
  return value === "groups" ? "groups" : "teachers";
}

function matchesScope(member: Member, scope: TeacherScope, currentUser: Me): boolean {
  if (scope === "all") return true;
  if (scope === "mine") {
    const currentSubgroupIds = new Set(currentUser.subgroups.map(({ id }) => id));
    return member.subgroups.some(({ id }) => currentSubgroupIds.has(id));
  }
  return member.subgroups.some((subgroup) => subgroupSchoolLevel(subgroup) === scope);
}

export function filterTeachers(
  members: readonly Member[],
  query: string,
  scope: TeacherScope,
  currentUser: Me
): Member[] {
  const terms = normalizeSearchText(query).split(/\s+/u).filter(Boolean);

  return sortMembers(
    members.filter((member) => {
      if (!matchesScope(member, scope, currentUser)) return false;
      const searchable = normalizeSearchText(
        [
          member.name ?? "",
          member.email,
          ...member.subgroups.flatMap(({ name, folder }) => [name, folder ?? ""]),
        ].join(" ")
      );
      return terms.every((term) => searchable.includes(term));
    })
  );
}

export function groupTeachersAlphabetically(
  members: readonly Member[]
): TeacherLetterGroup[] {
  const groups = new Map<string, Member[]>();
  for (const member of sortMembers(members)) {
    const first = normalizeSearchText(member.name?.trim() ?? "").charAt(0).toLocaleUpperCase("it");
    const letter = /^[A-Z]$/u.test(first) ? first : "#";
    groups.set(letter, [...(groups.get(letter) ?? []), member]);
  }

  return [...groups]
    .sort(([first], [second]) => {
      if (first === "#") return 1;
      if (second === "#") return -1;
      return first.localeCompare(second, "it", { sensitivity: "base" });
    })
    .map(([letter, values]) => ({ letter, members: values }));
}
