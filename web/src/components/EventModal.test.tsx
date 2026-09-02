// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import EventModal, { type EventDraft } from "./EventModal";
import { useState } from "react";

const draft: EventDraft = {
  title: "Consiglio di classe",
  description: "",
  location: "",
  startsAt: "2026-09-02T09:00",
  endsAt: "2026-09-02T10:00",
  allDay: false,
  isGlobal: true,
  bachecaOnly: false,
  subgroupIds: [],
  tagNames: [],
};

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Apri evento</button>
      {open && (
        <EventModal
          draft={draft}
          subgroups={[]}
          knownTags={[]}
          onSaved={() => {}}
          onDeleted={() => {}}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

afterEach(cleanup);

describe("EventModal dialog contract", () => {
  it("labels the modal, traps Tab, closes on Escape, and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Apri evento" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Nuovo evento" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const close = screen.getByRole("button", { name: "Chiudi finestra evento" });
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

  it("gives each TAG removal control a localized tag-specific name", () => {
    render(
      <EventModal
        draft={{ ...draft, tagNames: ["RIUNIONI"] }}
        subgroups={[]}
        knownTags={[]}
        onSaved={() => {}}
        onDeleted={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Rimuovi TAG RIUNIONI" })).toBeTruthy();
  });
});
