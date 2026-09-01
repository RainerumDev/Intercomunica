import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Subgroup schema", () => {
  it("exposes an optional color override", () => {
    const subgroup = Prisma.dmmf.datamodel.models.find((model) => model.name === "Subgroup");
    const color = subgroup?.fields.find((field) => field.name === "color");

    expect(color).toMatchObject({ type: "String", isRequired: false, isList: false });
  });

  it("adds the nullable color column with an additive migration", () => {
    const migration = readFileSync(
      new URL("../prisma/migrations/20260901000000_subgroup_color/migration.sql", import.meta.url),
      "utf8"
    );

    expect(migration.trim()).toBe('ALTER TABLE "Subgroup"\n  ADD COLUMN "color" TEXT;');
  });
});
