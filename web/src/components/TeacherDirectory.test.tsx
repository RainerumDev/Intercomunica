// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeacherLetterGroup, TeacherScope } from "../directory";
import type { Member } from "../types";
import TeacherDirectory from "./TeacherDirectory";

const annalisa: Member = {
  id: "teacher-1",
  email: "annalisa.rossetti@rainerum.it",
  name: "Annalisa Rossetti",
  role: "TEACHER",
  subgroups: [{ id: "middle-1", name: "CDC 1A", folder: "Medie" }],
};

const bruno: Member = {
  id: "teacher-2",
  email: "bruno.bianchi@rainerum.it",
  name: "Bruno Bianchi",
  role: "TEACHER",
  subgroups: [],
};

const groups: TeacherLetterGroup[] = [
  { letter: "A", members: [annalisa] },
  { letter: "B", members: [bruno] },
];

afterEach(cleanup);

function renderDirectory(
  options: {
    groups?: TeacherLetterGroup[];
    selectedId?: string | null;
    scope?: TeacherScope;
    onScopeChange?: (scope: TeacherScope) => void;
    onSelect?: (memberId: string, trigger: HTMLButtonElement) => void;
  } = {}
) {
  return render(
    <TeacherDirectory
      groups={options.groups ?? groups}
      selectedId={options.selectedId ?? null}
      scope={options.scope ?? "all"}
      onScopeChange={options.onScopeChange ?? (() => {})}
      onSelect={options.onSelect ?? (() => {})}
    />
  );
}

describe("TeacherDirectory", () => {
  it("renders every controlled scope with its full label", async () => {
    const user = userEvent.setup();
    const onScopeChange = vi.fn();
    renderDirectory({ scope: "middle", onScopeChange });

    expect(screen.getByRole("button", { name: "Tutti" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Docenti medie" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Docenti superiori" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "I miei gruppi" }));
    expect(onScopeChange).toHaveBeenCalledWith("mine");
  });

  it("renders alphabet headings, native contact rows, and links only for present letters", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderDirectory({ selectedId: annalisa.id, onSelect });

    expect(screen.getByRole("heading", { name: "A" }).id).toBe("teacher-letter-A");
    expect(screen.getByRole("heading", { name: "B" }).id).toBe("teacher-letter-B");
    const alphabet = screen.getByRole("navigation", { name: "Indice alfabetico" });
    expect(alphabet.querySelectorAll("a")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "A" }).getAttribute("href")).toBe("#teacher-letter-A");
    expect(screen.queryByRole("link", { name: "C" })).toBeNull();

    const row = screen.getByRole("button", { name: "Mostra dettagli di Annalisa Rossetti" });
    expect(row.tagName).toBe("BUTTON");
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(row.textContent).toContain("AR");
    expect(row.textContent).toContain("annalisa.rossetti@rainerum.it");
    await user.click(row);
    expect(onSelect).toHaveBeenCalledWith("teacher-1", row);
  });

  it("shows a dedicated empty state without an alphabet rail", () => {
    renderDirectory({ groups: [] });

    expect(screen.getByText("Nessun docente corrisponde alla ricerca e ai filtri.")).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "Indice alfabetico" })).toBeNull();
  });
});
