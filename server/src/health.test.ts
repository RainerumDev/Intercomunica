import { describe, expect, it } from "vitest";
import { checkDatabase } from "./health.js";

describe("checkDatabase", () => {
  it("returns true when the database query succeeds", async () => {
    await expect(checkDatabase(async () => [{ result: 1 }])).resolves.toBe(true);
  });

  it("returns false when the database query fails", async () => {
    await expect(
      checkDatabase(async () => {
        throw new Error("database unavailable");
      })
    ).resolves.toBe(false);
  });
});
