import { describe, expect, it } from "vitest";

async function subject() {
  return (await import("./subgroups.js")) as {
    subgroupColors: (
      name: string,
      override?: string | null
    ) => { background: string; foreground: string; border: string; contrast: number };
    sortSubgroups: <T extends { id: string; name: string; folder?: string | null }>(
      values: readonly T[]
    ) => T[];
    sortMembers: <T extends { name?: string | null; email: string }>(values: readonly T[]) => T[];
    buildDirectorySections: <
      TMember extends {
        id: string;
        name?: string | null;
        email: string;
        subgroups: readonly { id: string }[];
      },
      TSubgroup extends { id: string; name: string; folder?: string | null },
    >(
      members: readonly TMember[],
      subgroups: readonly TSubgroup[]
    ) => Array<
      | {
          kind: "folder";
          label: string;
          groups: Array<{ subgroup: TSubgroup; members: TMember[] }>;
        }
      | { kind: "ungrouped"; label: "Senza sottogruppo"; members: TMember[] }
    >;
    normalizeColorOverride: (value: string | null) => string | null;
  };
}

describe("subgroup presentation", () => {
  it("derives a stable readable color from the subgroup name", async () => {
    const { subgroupColors } = await subject();

    expect(subgroupColors("Consiglio 1A", null)).toEqual({
      background: "#8122AA",
      foreground: "#FFFFFF",
      border: "#9A4EBB",
      contrast: 7.656710172513475,
    });
    expect(subgroupColors("Consiglio 1A", null)).toEqual(subgroupColors("Consiglio 1A", null));
    expect(subgroupColors("Consiglio 1B", null).background).not.toBe("#8122AA");
  });

  it("preserves a manual background and chooses readable text", async () => {
    const { subgroupColors } = await subject();

    const light = subgroupColors("Ignorato", "#F2E85C");
    const dark = subgroupColors("Ignorato", "#24324A");

    expect(light.background).toBe("#F2E85C");
    expect(light.foreground).toBe("#172033");
    expect(light.contrast).toBeGreaterThanOrEqual(4.5);
    expect(dark.background).toBe("#24324A");
    expect(dark.foreground).toBe("#FFFFFF");
    expect(dark.contrast).toBeGreaterThanOrEqual(4.5);

    const middle = subgroupColors("Ignorato", "#777777");
    expect(middle.foreground).toBe("#000000");
    expect(middle.contrast).toBeGreaterThanOrEqual(4.5);
  });

  it("sorts copied subgroup data by folder, name, and id", async () => {
    const { sortSubgroups } = await subject();
    const input = [
      { id: "3", name: "B", folder: "Classi" },
      { id: "4", name: "Senza cartella", folder: null },
      { id: "2", name: "A", folder: "Dipartimenti" },
      { id: "1", name: "A", folder: "Classi" },
    ];
    const original = structuredClone(input);

    expect(sortSubgroups(input).map((entry) => entry.id)).toEqual(["1", "3", "2", "4"]);
    expect(input).toEqual(original);
  });

  it("uses trimmed Italian folder and subgroup collation with numeric labels", async () => {
    const { sortSubgroups } = await subject();
    const input = [
      { id: "general-2", name: "Area 2", folder: "  " },
      { id: "class-10", name: "Classe 10", folder: " Classi " },
      { id: "department-f", name: "Fisica", folder: "Dipartimenti" },
      { id: "class-2", name: "Classe 2", folder: "Classi" },
      { id: "department-e", name: "Ètica", folder: "Dipartimenti" },
      { id: "general-1", name: "Area 1", folder: null },
    ];
    const original = structuredClone(input);

    expect(sortSubgroups(input).map((entry) => entry.id)).toEqual([
      "class-2",
      "class-10",
      "department-e",
      "department-f",
      "general-1",
      "general-2",
    ]);
    expect(input).toEqual(original);
  });

  it("sorts copied members by display name and then email", async () => {
    const { sortMembers } = await subject();
    const input = [
      { name: null, email: "zeta@rainerum.it" },
      { name: "Anna Bianchi", email: "b@rainerum.it" },
      { name: "Anna Bianchi", email: "a@rainerum.it" },
    ];
    const original = structuredClone(input);

    expect(sortMembers(input).map((entry) => entry.email)).toEqual([
      "a@rainerum.it",
      "b@rainerum.it",
      "zeta@rainerum.it",
    ]);
    expect(input).toEqual(original);
  });

  it("uses email for blank names and resolves accented, numeric, and display-name ties", async () => {
    const { sortMembers } = await subject();
    const input = [
      { name: "Docente 10", email: "dieci@rainerum.it" },
      { name: "Élia", email: "zeta@rainerum.it" },
      { name: "Elia", email: "alfa@rainerum.it" },
      { name: "  ", email: "anna@rainerum.it" },
      { name: "Docente 2", email: "due@rainerum.it" },
    ];
    const original = structuredClone(input);

    expect(sortMembers(input).map((entry) => entry.email)).toEqual([
      "anna@rainerum.it",
      "due@rainerum.it",
      "dieci@rainerum.it",
      "alfa@rainerum.it",
      "zeta@rainerum.it",
    ]);
    expect(input).toEqual(original);
  });

  it("projects immutable folder sections, repeats multi-members, and appends unmatched members", async () => {
    const { buildDirectorySections } = await subject();
    const members = [
      {
        id: "m-zeta",
        name: "Zeta",
        email: "zeta@rainerum.it",
        subgroups: [{ id: "class-10" }, { id: "class-2" }, { id: "class-2" }],
      },
      {
        id: "m-mail",
        name: " ",
        email: "anna@rainerum.it",
        subgroups: [{ id: "class-2" }],
      },
      {
        id: "m-beta",
        name: "Beta",
        email: "beta@rainerum.it",
        subgroups: [{ id: "class-2" }],
      },
      {
        id: "m-none",
        name: "Carlo",
        email: "carlo@rainerum.it",
        subgroups: [],
      },
      {
        id: "m-stale",
        name: "Dario",
        email: "dario@rainerum.it",
        subgroups: [{ id: "missing" }],
      },
    ] as const;
    const subgroups = [
      { id: "class-10", name: "Classe 10", folder: "Classi" },
      { id: "empty", name: "Vuoto", folder: "Dipartimenti" },
      { id: "class-2", name: "Classe 2", folder: " Classi " },
    ] as const;
    const originalMembers = structuredClone(members);
    const originalSubgroups = structuredClone(subgroups);

    const sections = buildDirectorySections(members, subgroups);

    expect(
      sections.map((section) =>
        section.kind === "folder"
          ? {
              kind: section.kind,
              label: section.label,
              groups: section.groups.map((group) => ({
                subgroup: group.subgroup.id,
                members: group.members.map((member) => member.id),
              })),
            }
          : {
              kind: section.kind,
              label: section.label,
              members: section.members.map((member) => member.id),
            }
      )
    ).toEqual([
      {
        kind: "folder",
        label: "Classi",
        groups: [
          { subgroup: "class-2", members: ["m-mail", "m-beta", "m-zeta"] },
          { subgroup: "class-10", members: ["m-zeta"] },
        ],
      },
      {
        kind: "ungrouped",
        label: "Senza sottogruppo",
        members: ["m-none", "m-stale"],
      },
    ]);
    expect(members).toEqual(originalMembers);
    expect(subgroups).toEqual(originalSubgroups);
  });

  it("keeps case- and accent-equivalent normalized folder labels distinct for either input order", async () => {
    const { buildDirectorySections } = await subject();
    const members = [
      { id: "upper", name: "Anna", email: "upper@rainerum.it", subgroups: [{ id: "upper" }] },
      { id: "lower", name: "Bruno", email: "lower@rainerum.it", subgroups: [{ id: "lower" }] },
      { id: "plain", name: "Carla", email: "plain@rainerum.it", subgroups: [{ id: "plain" }] },
      { id: "accent", name: "Dario", email: "accent@rainerum.it", subgroups: [{ id: "accent" }] },
    ];
    const subgroups = [
      { id: "accent", name: "Gruppo B", folder: " Ètica " },
      { id: "lower", name: "Gruppo B", folder: " classi " },
      { id: "plain", name: "Gruppo A", folder: " Etica " },
      { id: "upper", name: "Gruppo A", folder: " Classi " },
    ];
    const summarize = (values: typeof subgroups) =>
      buildDirectorySections(members, values).map((section) => ({
        label: section.label,
        groups: section.kind === "folder" ? section.groups.map((group) => group.subgroup.id) : [],
      }));
    const expected = [
      { label: "Classi", groups: ["upper"] },
      { label: "classi", groups: ["lower"] },
      { label: "Etica", groups: ["plain"] },
      { label: "Ètica", groups: ["accent"] },
    ];

    expect(summarize(subgroups)).toEqual(expected);
    expect(summarize([...subgroups].reverse())).toEqual(expected);
  });

  it("normalizes manual color overrides and preserves automatic mode", async () => {
    const { normalizeColorOverride } = await subject();

    expect(normalizeColorOverride(null)).toBeNull();
    expect(normalizeColorOverride("  ")).toBeNull();
    expect(normalizeColorOverride("#1a2b3c")).toBe("#1A2B3C");
  });
});
