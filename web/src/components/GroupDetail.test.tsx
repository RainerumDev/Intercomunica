// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
      email: `docente-${index}@rainerum.it`,
      name: `Docente ${String(index).padStart(2, "0")}`,
    })),
    { id: "aaron", email: "aaron@rainerum.it", name: "Aaron Primo" },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
    expect(screen.getByRole("button", { name: "Download Excel membri" })).not.toBeNull();
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
    expect(screen.getByRole("button", { name: "Download Excel membri" })).not.toBeNull();
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

  it("downloads a real Excel file for a non-admin", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((_blob: Blob) => "blob:members-export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const downloads: { filename: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ filename: this.download, href: this.href });
    });
    render(<GroupDetail subgroup={subgroup} isAdmin={false} onEdit={vi.fn()} onDelete={vi.fn()} onEmail={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Download Excel membri" }) as HTMLButtonElement;
    await user.click(button);
    await waitFor(() => expect(downloads).toEqual([{ filename: "CDC 5 Liceo.xlsx", href: "blob:members-export" }]), { timeout: 5000 });
    expect(button.disabled).toBe(false);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(blob);
    });
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(document.querySelector("a[download]")).toBeNull();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:members-export"), { timeout: 2000 });
  }, 10000);

  it("shows download failures and allows a retry", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("URL", { createObjectURL: () => { throw new Error("Download failed"); } });
    render(<GroupDetail subgroup={subgroup} isAdmin={false} onEdit={vi.fn()} onDelete={vi.fn()} onEmail={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Download Excel membri" }) as HTMLButtonElement;
    await user.click(button);
    expect((await screen.findByRole("alert")).textContent).toContain("Riprova");
    expect(button.disabled).toBe(false);
  });
});
