// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import type { Subgroup } from "../types";
import SubgroupDetailsModal from "./SubgroupDetailsModal";

const subgroup: Subgroup = {
  id: "group-1",
  name: "Gruppo uno",
  description: null,
  folder: "Classi",
  color: "#1D4ED8",
  members: [{ id: "member-1", email: "docente@example.edu", name: "Docente" }],
};

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Apri dettagli</button>
      {open && (
        <SubgroupDetailsModal
          subgroup={subgroup}
          onClose={() => setOpen(false)}
          onEmail={() => undefined}
        />
      )}
    </>
  );
}

afterEach(cleanup);

describe("SubgroupDetailsModal focus", () => {
  it("traps keyboard focus, closes on Escape, and restores the opening control", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Apri dettagli" });

    await user.click(trigger);
    const close = screen.getByLabelText("Chiudi");
    const email = screen.getByRole("button", { name: "✉️ Invia email" });
    expect(document.activeElement).toBe(close);

    close.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(email);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
