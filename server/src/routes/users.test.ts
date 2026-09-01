import { describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({ prisma: {} }));
vi.mock("../auth/session.js", () => ({ requireAuth: vi.fn() }));

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

  it("preserves subgroup details without exposing legacy calendar state", async () => {
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

    expect(result).toEqual({
      id: "teacher-1",
      email: "docente@rainerum.it",
      name: "Mario Rossi",
      role: "TEACHER",
      subgroups: [
        { id: "group-1a", name: "1A", folder: "Classi", color: "#1A2B3C" },
      ],
    });
  });
});
