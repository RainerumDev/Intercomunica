import { describe, expect, it } from "vitest";
import type { Me, Member } from "./types";

async function subject() {
  return (await import("./directory.js")) as {
    parseDirectoryTab: (value: string | null) => "teachers" | "groups";
    filterTeachers: (
      members: readonly Member[],
      query: string,
      scope: "all" | "middle" | "upper" | "mine",
      currentUser: Me
    ) => Member[];
    groupTeachersAlphabetically: (
      members: readonly Member[]
    ) => Array<{ letter: string; members: Member[] }>;
  };
}

const middle = { id: "middle-1a", name: "CDC 1À", folder: "Scuola Média", color: null };
const upper = { id: "upper-5l", name: "CDC 5 Liceo", folder: "Consigli superiori", color: null };
const other = { id: "staff", name: "Staff orientamento", folder: "Organizzazione", color: null };

const members: Member[] = [
  {
    id: "teacher-upper",
    name: "Bianca Verdi",
    email: "bianca.verdi@rainerum.it",
    role: "TEACHER",
    subgroups: [upper],
  },
  {
    id: "teacher-middle",
    name: "Annalisa Ròssetti",
    email: "annalisa.rossetti@rainerum.it",
    role: "TEACHER",
    subgroups: [middle, other],
  },
  {
    id: "teacher-other",
    name: "Carlo Neri",
    email: "carlo.neri@rainerum.it",
    role: "TEACHER",
    subgroups: [other],
  },
  {
    id: "admin",
    name: "Amministratore",
    email: "admin@rainerum.it",
    role: "ADMIN",
    subgroups: [middle],
  },
];

const me: Me = {
  id: "current-user",
  name: "Docente corrente",
  email: "current@rainerum.it",
  picture: null,
  role: "TEACHER",
  subgroups: [middle],
};

describe("directory view model", () => {
  it("accepts the groups tab and defaults every other value to teachers", async () => {
    const { parseDirectoryTab } = await subject();

    expect(parseDirectoryTab("groups")).toBe("groups");
    expect(parseDirectoryTab("teachers")).toBe("teachers");
    expect(parseDirectoryTab("invalid")).toBe("teachers");
    expect(parseDirectoryTab(null)).toBe("teachers");
  });

  it("searches teacher names, email addresses, and subgroup labels without accents", async () => {
    const { filterTeachers } = await subject();

    expect(filterTeachers(members, "rossetti 1a", "all", me).map(({ id }) => id)).toEqual([
      "teacher-middle",
    ]);
    expect(filterTeachers(members, "BIANCA.VERDI@", "all", me).map(({ id }) => id)).toEqual([
      "teacher-upper",
    ]);
    expect(filterTeachers(members, "média", "all", me).map(({ id }) => id)).toEqual([
      "admin",
      "teacher-middle",
    ]);
  });

  it("applies all, middle, upper, and shared-group scopes to teachers", async () => {
    const { filterTeachers } = await subject();

    expect(filterTeachers(members, "", "all", me).map(({ id }) => id)).toEqual([
      "admin",
      "teacher-middle",
      "teacher-upper",
      "teacher-other",
    ]);
    expect(filterTeachers(members, "", "middle", me).map(({ id }) => id)).toEqual([
      "admin",
      "teacher-middle",
    ]);
    expect(filterTeachers(members, "", "upper", me).map(({ id }) => id)).toEqual([
      "teacher-upper",
    ]);
    expect(filterTeachers(members, "", "mine", me).map(({ id }) => id)).toEqual([
      "admin",
      "teacher-middle",
    ]);
  });

  it("combines search and scope without mutating members or the current user", async () => {
    const { filterTeachers } = await subject();
    const originalMembers = structuredClone(members);
    const originalMe = structuredClone(me);

    expect(filterTeachers(members, "rossétti", "middle", me).map(({ id }) => id)).toEqual([
      "teacher-middle",
    ]);
    expect(members).toEqual(originalMembers);
    expect(me).toEqual(originalMe);
  });

  it("groups sorted teachers by normalized initial and puts unnamed teachers under a final hash", async () => {
    const { groupTeachersAlphabetically } = await subject();
    const input: Member[] = [
      { id: "b", name: "Bianca", email: "b@rainerum.it", role: "TEACHER", subgroups: [] },
      { id: "unnamed", name: "  ", email: "aaa@rainerum.it", role: "TEACHER", subgroups: [] },
      { id: "accent", name: "Àgata", email: "z@rainerum.it", role: "TEACHER", subgroups: [] },
      { id: "a", name: "Anna", email: "a@rainerum.it", role: "TEACHER", subgroups: [] },
    ];
    const original = structuredClone(input);

    const groups = groupTeachersAlphabetically(input);

    expect(groups.map(({ letter }) => letter)).toEqual(["A", "B", "#"]);
    expect(groups.map(({ members: values }) => values.map(({ id }) => id))).toEqual([
      ["accent", "a"],
      ["b"],
      ["unnamed"],
    ]);
    expect(input).toEqual(original);
  });
});
