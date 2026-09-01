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

  it("includes folder and color in teacher subgroup tags", async () => {
    const usersModule = await import("./users.js");
    const serializeDirectoryUser = (
      usersModule as typeof usersModule & {
        serializeDirectoryUser: (user: unknown) => { subgroups: unknown[] };
      }
    ).serializeDirectoryUser;

    const result = serializeDirectoryUser({
      id: "teacher-1",
      email: "docente@rainerum.it",
      name: "Mario Rossi",
      role: "TEACHER",
      calendarId: "calendar-1",
      subgroups: [
        {
          subgroup: {
            id: "group-1a",
            name: "1A",
            folder: "Classi",
            color: "#1A2B3C",
          },
        },
      ],
    });

    expect(result.subgroups).toEqual([
      { id: "group-1a", name: "1A", folder: "Classi", color: "#1A2B3C" },
    ]);
  });
});
