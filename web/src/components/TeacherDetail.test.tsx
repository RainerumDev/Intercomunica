// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member, Subgroup } from "../types";
import TeacherDetail from "./TeacherDetail";

const middle: Subgroup = {
  id: "middle-1",
  name: "CDC 1A",
  folder: "Medie",
  description: null,
  color: null,
  members: [],
};

const upper: Subgroup = {
  id: "upper-1",
  name: "CDC 5 Liceo",
  folder: "Superiori",
  description: null,
  color: null,
  members: [],
};

const available: Subgroup = {
  id: "available-1",
  name: "Dipartimento STEM",
  folder: "Dipartimenti",
  description: null,
  color: null,
  members: [],
};

const member: Member = {
  id: "teacher-1",
  email: "annalisa.rossetti@rainerum.it",
  name: "Annalisa Rossetti",
  role: "TEACHER",
  subgroups: [upper, middle],
};

afterEach(cleanup);

describe("TeacherDetail", () => {
  it("shows contact information and every assigned group in sorted inspectable order", async () => {
    const user = userEvent.setup();
    const onInspect = vi.fn();
    render(
      <TeacherDetail
        member={member}
        isAdmin={false}
        allSubgroups={[available, upper, middle]}
        onAdd={() => {}}
        onRemove={() => {}}
        onInspect={onInspect}
      />
    );

    expect(screen.getByRole("heading", { name: "Annalisa Rossetti" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "annalisa.rossetti@rainerum.it" }).getAttribute("href"))
      .toBe("mailto:annalisa.rossetti@rainerum.it");
    const groupButtons = screen.getAllByRole("button", { name: /Mostra i membri di/ });
    expect(groupButtons.map((button) => button.textContent)).toEqual(["CDC 1A", "CDC 5 Liceo"]);
    await user.click(groupButtons[1]);
    expect(onInspect).toHaveBeenCalledWith("upper-1");
    expect(screen.queryByTitle("Aggiungi a un sottogruppo")).toBeNull();
    expect(screen.queryByRole("button", { name: "Rimuovi da CDC 1A" })).toBeNull();
  });

  it("reuses the authorized membership controls for admins", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onInspect = vi.fn();
    render(
      <TeacherDetail
        member={member}
        isAdmin
        allSubgroups={[available, upper, middle]}
        onAdd={onAdd}
        onRemove={onRemove}
        onInspect={onInspect}
      />
    );

    await user.click(screen.getByRole("button", { name: "Mostra i membri di CDC 5 Liceo" }));
    expect(onInspect).toHaveBeenCalledWith("upper-1");

    await user.click(screen.getByRole("button", { name: "Rimuovi da CDC 1A" }));
    expect(onRemove).toHaveBeenCalledWith(member, "middle-1");

    await user.click(screen.getByRole("button", { name: "Aggiungi a un sottogruppo" }));
    await user.click(screen.getByRole("button", { name: /Dipartimento STEM/ }));
    expect(onAdd).toHaveBeenCalledWith(member, "available-1");
  });

  it("gives teachers without groups a clear empty state", () => {
    render(
      <TeacherDetail
        member={{ ...member, subgroups: [] }}
        isAdmin={false}
        allSubgroups={[]}
        onAdd={() => {}}
        onRemove={() => {}}
        onInspect={() => {}}
      />
    );

    expect(screen.getByText("Nessun gruppo assegnato.")).not.toBeNull();
  });
});
