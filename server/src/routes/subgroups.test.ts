import { describe, expect, it } from "vitest";

describe("subgroup input", () => {
  it("normalizes a manual color and preserves automatic color", async () => {
    const module = await import("./subgroups.js");
    const parseSubgroupInput = (
      module as typeof module & {
        parseSubgroupInput: (input: unknown) => { name: string; color?: string | null };
      }
    ).parseSubgroupInput;

    expect(parseSubgroupInput({ name: "1A", color: "#1a2b3c" }).color).toBe("#1A2B3C");
    expect(parseSubgroupInput({ name: "1A", color: null }).color).toBeNull();
  });

  it("rejects malformed manual colors", async () => {
    const module = await import("./subgroups.js");
    const parseSubgroupInput = (
      module as typeof module & { parseSubgroupInput: (input: unknown) => unknown }
    ).parseSubgroupInput;

    expect(() => parseSubgroupInput({ name: "1A", color: "red" })).toThrow();
    expect(() => parseSubgroupInput({ name: "1A", color: "#123" })).toThrow();
  });
});
