// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  hasCalendar: true,
  subgroups: [{ id: "group-1", name: "Gruppo uno" }],
};
const subgroup: Subgroup = {
  id: "group-1",
  name: "Gruppo uno",
  description: null,
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
