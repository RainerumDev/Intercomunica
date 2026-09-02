// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import type { Member, Subgroup } from "../types";
import Directory from "./Directory";

vi.mock("../auth", () => ({
  useAuth: () => ({
    me: { id: "admin-1", email: "admin@example.edu", name: "Admin", picture: null, role: "ADMIN", subgroups: [] },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
}));

const member: Member = {
  id: "member-1",
  email: "docente@example.edu",
  name: "Docente",
  role: "TEACHER",
  subgroups: [{ id: "group-1", name: "Gruppo uno" }],
};
const subgroup: Subgroup = {
  id: "group-1",
  name: "Gruppo uno",
  description: null,
  color: null,
  members: [{ id: member.id, email: member.email, name: member.name }],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Directory subgroup editor dialog", () => {
  it("labels the modal, traps Tab, closes on Escape, and restores trigger focus", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/users") return Promise.resolve([member]);
      if (path === "/api/subgroups") return Promise.resolve([subgroup]);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);
    render(<Directory />);
    const trigger = await screen.findByRole("button", { name: "Modifica sottogruppo" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Modifica sottogruppo" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const close = screen.getByRole("button", { name: "Chiudi modifica sottogruppo" });
    expect(document.activeElement).toBe(close);

    const save = screen.getByRole("button", { name: "Salva" });
    save.focus();
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(save);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe("Directory teacher grouping", () => {
  it("renders folder and subgroup sections with sorted repeated and ungrouped teachers", async () => {
    const subgroups: Subgroup[] = [
      {
        id: "class-10",
        name: "Classe 10",
        folder: "Classi",
        description: null,
        color: null,
        members: [],
      },
      {
        id: "department",
        name: "Ètica",
        folder: "Dipartimenti",
        description: null,
        color: null,
        members: [],
      },
      {
        id: "class-2",
        name: "Classe 2",
        folder: " Classi ",
        description: null,
        color: null,
        members: [],
      },
    ];
    const members: Member[] = [
      {
        id: "zeta",
        email: "zeta@example.edu",
        name: "Zeta",
        role: "TEACHER",
        subgroups: [subgroups[0], subgroups[2]],
      },
      {
        id: "no-name",
        email: "anna@example.edu",
        name: " ",
        role: "TEACHER",
        subgroups: [subgroups[2]],
      },
      {
        id: "ungrouped",
        email: "carlo@example.edu",
        name: "Carlo",
        role: "TEACHER",
        subgroups: [],
      },
      {
        id: "beta",
        email: "beta@example.edu",
        name: "Beta",
        role: "TEACHER",
        subgroups: [subgroups[2], subgroups[1]],
      },
    ];
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/users") return Promise.resolve(members);
      if (path === "/api/subgroups") return Promise.resolve(subgroups);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);

    render(<Directory />);

    const directory = await screen.findByRole("region", { name: "Docenti" });
    const headings = within(directory)
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Docenti",
      "Classi",
      "Classe 2",
      "Classe 10",
      "Dipartimenti",
      "Ètica",
      "Senza sottogruppo",
    ]);

    const classTwoRows = within(within(directory).getByRole("table", { name: "Docenti di Classe 2" }))
      .getAllByRole("row")
      .slice(1);
    expect(classTwoRows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
      "—anna@example.edu",
      "Betabeta@example.edu",
      "Zetazeta@example.edu",
    ]);

    const classTen = within(directory).getByRole("table", { name: "Docenti di Classe 10" });
    expect(within(classTen).getByText("zeta@example.edu")).not.toBeNull();
    expect(within(directory).getAllByText("zeta@example.edu")).toHaveLength(2);

    const ungrouped = within(directory).getByRole("table", { name: "Docenti senza sottogruppo" });
    expect(within(ungrouped).getByText("carlo@example.edu")).not.toBeNull();
  });
});
