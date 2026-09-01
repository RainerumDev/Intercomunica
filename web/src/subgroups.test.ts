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

  it("normalizes manual color overrides and preserves automatic mode", async () => {
    const { normalizeColorOverride } = await subject();

    expect(normalizeColorOverride(null)).toBeNull();
    expect(normalizeColorOverride("  ")).toBeNull();
    expect(normalizeColorOverride("#1a2b3c")).toBe("#1A2B3C");
  });
});
