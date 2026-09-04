// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Subgroup } from "../types";
import GroupDetail from "./GroupDetail";

const subgroup: Subgroup = {
  id: "group-5l",
  name: "CDC 5 Liceo",
  description: "Consiglio della classe quinta",
  folder: "Consigli di Classe · Liceo",
  color: "#1D4ED8",
  members: [
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `member-${index}`,
      email: `docente-${index}@example.edu`,
      name: `Docente ${String(index).padStart(2, "0")}`,
    })),
    { id: "aaron", email: "aaron@example.edu", name: "Aaron Primo" },
  ],
};

afterEach(cleanup);

describe("GroupDetail", () => {
  it("shows every sorted member immediately and keeps email as the final content action", () => {
    render(
      <GroupDetail
        subgroup={subgroup}
        isAdmin={false}
        onEdit={() => undefined}
        onDelete={() => undefined}
        onEmail={() => undefined}
      />
    );

    const memberRows = screen.getAllByTestId("group-member");
    expect(memberRows).toHaveLength(11);
    expect(memberRows[0].textContent).toContain("Aaron Primo");
    expect(screen.queryByText(/Mostra tutti/i)).toBeNull();
    const email = screen.getByRole("button", { name: "Invia email al gruppo" });
    expect(memberRows.at(-1)!.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("#1D4ED8")).toBeNull();
    expect(screen.queryByText(/aggiornat/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Modifica gruppo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Elimina gruppo" })).toBeNull();
  });

  it("exposes explicit admin actions and forwards every action", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onEmail = vi.fn();
    render(<GroupDetail subgroup={subgroup} isAdmin onEdit={onEdit} onDelete={onDelete} onEmail={onEmail} />);

    await user.click(screen.getByRole("button", { name: "Modifica gruppo" }));
    await user.click(screen.getByRole("button", { name: "Elimina gruppo" }));
    await user.click(screen.getByRole("button", { name: "Invia email al gruppo" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEmail).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Gestisci/i })).toBeNull();
  });

  it("disables email only for an empty group", () => {
    render(
      <GroupDetail
        subgroup={{ ...subgroup, members: [] }}
        isAdmin={false}
        onEdit={() => undefined}
        onDelete={() => undefined}
        onEmail={() => undefined}
      />
    );

    expect((screen.getByRole("button", { name: "Invia email al gruppo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Nessun membro nel gruppo.")).not.toBeNull();
  });
});
