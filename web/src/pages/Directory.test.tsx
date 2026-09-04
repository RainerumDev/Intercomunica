// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
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
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

function RouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Posizione corrente">{location.pathname}{location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>Cronologia indietro</button>
    </>
  );
}

function renderDirectory(initialEntry = "/directory") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Directory />
      <RouterProbe />
    </MemoryRouter>
  );
}

describe("Directory subgroup editor dialog", () => {
  it("labels the modal, traps Tab, closes on Escape, and restores trigger focus", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/users") return Promise.resolve([member]);
      if (path === "/api/subgroups") return Promise.resolve([subgroup]);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);
    renderDirectory("/directory?tab=groups");
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

    renderDirectory();

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

describe("Directory shell state", () => {
  it("pushes tab changes to history and restores the prior tab with browser Back", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/users") return Promise.resolve([member]);
      if (path === "/api/subgroups") return Promise.resolve([subgroup]);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);

    renderDirectory("/directory?tab=groups");

    const groupsTab = await screen.findByRole("tab", { name: /Gruppi/ });
    expect(groupsTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("searchbox", { name: "Cerca gruppi" })).not.toBeNull();
    expect(document.getElementById("directory-panel-groups")?.hasAttribute("hidden")).toBe(false);
    expect(document.getElementById("directory-panel-teachers")?.hasAttribute("hidden")).toBe(true);

    await user.click(screen.getByRole("tab", { name: /Docenti/ }));

    expect(screen.getByRole("tab", { name: /Docenti/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("searchbox", { name: "Cerca docenti" })).not.toBeNull();
    expect(screen.getByLabelText("Posizione corrente").textContent).toBe("/directory?tab=teachers");

    await user.click(screen.getByRole("button", { name: "Cronologia indietro" }));

    expect(screen.getByRole("tab", { name: /Gruppi/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Posizione corrente").textContent).toBe("/directory?tab=groups");
  });

  it("keeps independent queries while switching tabs", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/users") return Promise.resolve([member]);
      if (path === "/api/subgroups") return Promise.resolve([subgroup]);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);

    renderDirectory("/directory?tab=groups");
    const groupSearch = await screen.findByRole("searchbox", { name: "Cerca gruppi" });
    await user.type(groupSearch, "uno");
    await user.click(screen.getByRole("tab", { name: /Docenti/ }));
    const teacherSearch = screen.getByRole("searchbox", { name: "Cerca docenti" });
    await user.type(teacherSearch, "docente");
    await user.click(screen.getByRole("tab", { name: /Gruppi/ }));
    expect(screen.getByRole("searchbox", { name: "Cerca gruppi" }).getAttribute("value")).toBe("uno");
    await user.click(screen.getByRole("tab", { name: /Docenti/ }));
    expect(screen.getByRole("searchbox", { name: "Cerca docenti" }).getAttribute("value")).toBe("docente");
  });

  it.each(["/directory", "/directory?tab=invalid"])(
    "falls back to Docenti for %s",
    async (initialEntry) => {
      vi.spyOn(api, "get").mockImplementation(((path: string) => {
        if (path === "/api/users") return Promise.resolve([member]);
        if (path === "/api/subgroups") return Promise.resolve([subgroup]);
        throw new Error(`Unexpected GET ${path}`);
      }) as typeof api.get);

      renderDirectory(initialEntry);

      expect((await screen.findByRole("tab", { name: /Docenti/ })).getAttribute("aria-selected")).toBe("true");
      expect(screen.getByRole("searchbox", { name: "Cerca docenti" })).not.toBeNull();
    }
  );

  it("opens an explicitly selected mobile detail and restores query and scroll on return", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/users") return Promise.resolve([member]);
      if (path === "/api/subgroups") return Promise.resolve([subgroup]);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);

    renderDirectory();
    const search = await screen.findByRole("searchbox", { name: "Cerca docenti" });
    await user.type(search, "docente");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 216 });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    const selectedRow = screen.getByRole("button", { name: "Mostra dettagli di Docente" });
    await user.click(selectedRow);

    expect(screen.getByTestId("directory-layout").classList.contains("directory-layout--detail-open")).toBe(true);
    expect(screen.getByRole("heading", { name: "Docente" })).not.toBeNull();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" }));
    const back = screen.getByRole("button", { name: "Torna a tutti i docenti" });
    expect(document.activeElement).toBe(back);
    await user.click(back);

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 216, behavior: "auto" }));
    expect(document.activeElement).toBe(selectedRow);
    expect(screen.getByRole("searchbox", { name: "Cerca docenti" }).getAttribute("value")).toBe("docente");
    expect(screen.getByTestId("directory-layout").classList.contains("directory-layout--detail-open")).toBe(false);
  });

  it("keeps the original list position when the selected teacher is clicked again inside mobile detail", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/users") return Promise.resolve([member]);
      if (path === "/api/subgroups") return Promise.resolve([subgroup]);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    renderDirectory();
    await screen.findByRole("searchbox", { name: "Cerca docenti" });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 216 });
    const listRow = screen.getByRole("button", { name: "Mostra dettagli di Docente" });
    await user.click(listRow);
    const detailTable = screen.getByRole("table", { name: "Dettaglio di Docente" });

    Object.defineProperty(window, "scrollY", { configurable: true, value: 640 });
    await user.click(within(detailTable).getByRole("button", { name: "Mostra dettagli di Docente" }));
    await user.click(screen.getByRole("button", { name: "Torna a tutti i docenti" }));

    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({ top: 216, behavior: "auto" }));
    expect(document.activeElement).toBe(listRow);
  });

  it("opens and closes the contextual group detail without clearing its query", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/users") return Promise.resolve([member]);
      if (path === "/api/subgroups") return Promise.resolve([subgroup]);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);

    renderDirectory("/directory?tab=groups");
    const search = await screen.findByRole("searchbox", { name: "Cerca gruppi" });
    await user.type(search, "uno");
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Mostra dettagli di Gruppo uno" }));

    expect(screen.getByTestId("directory-layout").classList.contains("directory-layout--detail-open")).toBe(true);
    expect(screen.getByRole("heading", { name: "Gruppo uno" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Torna a tutti i gruppi" }));

    expect(screen.getByRole("searchbox", { name: "Cerca gruppi" }).getAttribute("value")).toBe("uno");
    expect(screen.getByTestId("directory-layout").classList.contains("directory-layout--detail-open")).toBe(false);
  });
});
