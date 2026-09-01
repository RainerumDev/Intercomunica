import { describe, expect, it } from "vitest";

describe("directory user filtering", () => {
  it("excludes configured accounts from the general teacher list", async () => {
    const usersModule = await import("./users.js");
    const buildDirectoryWhere = (
      usersModule as typeof usersModule & {
        buildDirectoryWhere: (q: string, excludedEmails: Set<string>) => unknown;
      }
    ).buildDirectoryWhere;

    expect(
      buildDirectoryWhere(
        "",
        new Set(["segreteria@rainerum.it", "portineria@rainerum.it"])
      )
    ).toEqual({
      isActive: true,
      email: { notIn: ["segreteria@rainerum.it", "portineria@rainerum.it"] },
    });
  });
});
