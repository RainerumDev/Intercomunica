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

  it("stores optional encrypted personal feed credentials with an indexed hash", () => {
    const user = Prisma.dmmf.datamodel.models.find((model) => model.name === "User");
    const fields = [
      "calendarFeedTokenHash",
      "calendarFeedTokenEnc",
      "calendarFeedTokenIssuedAt",
      "calendarFeedLastFetchedAt",
    ].map((name) => user?.fields.find((field) => field.name === name));

    expect(fields).toEqual([
      expect.objectContaining({ type: "String", isRequired: false, isUnique: true }),
      expect.objectContaining({ type: "String", isRequired: false }),
      expect.objectContaining({ type: "DateTime", isRequired: false }),
      expect.objectContaining({ type: "DateTime", isRequired: false }),
    ]);

    const migration = readFileSync(
      new URL("../prisma/migrations/20260901010000_personal_calendar_feed/migration.sql", import.meta.url),
      "utf8"
    );
    expect(migration).toContain('CREATE UNIQUE INDEX "User_calendarFeedTokenHash_key"');
  });
});
