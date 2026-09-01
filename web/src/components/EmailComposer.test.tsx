// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import type { Subgroup } from "../types";
import EmailComposer from "./EmailComposer";

const subgroup: Subgroup = {
  id: "group-1",
  name: "Gruppo uno",
  description: null,
  members: [{ id: "member-1", email: "docente@example.edu", name: "Docente" }],
};

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Apri email</button>
      {open && <EmailComposer subgroup={subgroup} onClose={() => setOpen(false)} />}
    </>
  );
}

afterEach(cleanup);

describe("EmailComposer dialog contract", () => {
  it("labels the modal, traps Tab, closes on Escape, and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Apri email" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /Email a «Gruppo uno»/ });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const close = screen.getByRole("button", { name: "Chiudi composizione email" });
    expect(document.activeElement).toBe(close);

    const cancel = screen.getByRole("button", { name: "Annulla" });
    cancel.focus();
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(cancel);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
