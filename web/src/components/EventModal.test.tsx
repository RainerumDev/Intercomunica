// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import EventModal, { shouldWarnForReadOnlyCalendar, type EventDraft } from "./EventModal";
import { useState } from "react";
import { api } from "../api";
import type { AppEvent, Subgroup } from "../types";

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

const subgroups: Subgroup[] = [
  {
    id: "group-1",
    name: "Gruppo uno",
    description: null,
    color: null,
    members: [],
  },
  {
    id: "group-2",
    name: "Gruppo due",
    description: null,
    color: null,
    members: [],
  },
];

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it("warns only for changes to Google-native event fields", () => {
    expect(shouldWarnForReadOnlyCalendar(draft, draft, false)).toBe(true);
    expect(
      shouldWarnForReadOnlyCalendar(
        { ...draft, id: "event-1" },
        { ...draft, id: "event-1", subgroupIds: ["gruppo-1"], tagNames: ["COLLEGIO"] },
        true
      )
    ).toBe(false);
    expect(
      shouldWarnForReadOnlyCalendar(
        { ...draft, id: "event-1" },
        { ...draft, id: "event-1", isGlobal: false, bachecaOnly: true },
        true
      )
    ).toBe(false);
    expect(
      shouldWarnForReadOnlyCalendar(
        { ...draft, id: "event-1" },
        { ...draft, id: "event-1", title: "Titolo modificato" },
        true
      )
    ).toBe(true);
  });

  it("shows the read-only warning for a new event", () => {
    render(
      <EventModal
        draft={draft}
        subgroups={[]}
        knownTags={[]}
        generalCalendarReadOnly
        onSaved={() => {}}
        onDeleted={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "non verrà sincronizzato con il calendario generale"
    );
  });

  it("prevents deleting a Google-linked event from a read-only calendar", () => {
    render(
      <EventModal
        draft={{ ...draft, id: "event-1", hasGeneralCalendarEvent: true }}
        subgroups={[]}
        knownTags={[]}
        generalCalendarReadOnly
        onSaved={() => {}}
        onDeleted={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull();
    expect(screen.getByText(/non può essere eliminato da Intercomunica/i)).toBeTruthy();
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

describe("EventModal audience selection", () => {
  it("switches from Tutti to the clicked subgroup and preserves subsequent subgroup toggles", async () => {
    const user = userEvent.setup();
    render(
      <EventModal
        draft={draft}
        subgroups={subgroups}
        knownTags={[]}
        onSaved={() => {}}
        onDeleted={() => {}}
        onClose={() => {}}
      />
    );

    const tutti = screen.getByRole("checkbox", { name: /Visibile a tutti/ }) as HTMLInputElement;
    const first = screen.getByRole("button", { name: "Gruppo uno" });
    const second = screen.getByRole("button", { name: "Gruppo due" });
    expect(tutti.checked).toBe(true);

    await user.click(first);
    expect(tutti.checked).toBe(false);
    expect(first.className).toContain("choice-chip--active");

    await user.click(second);
    expect(first.className).toContain("choice-chip--active");
    expect(second.className).toContain("choice-chip--active");
  });

  it("selecting Tutti clears every targeted subgroup selection", async () => {
    const user = userEvent.setup();
    render(
      <EventModal
        draft={{ ...draft, isGlobal: false, subgroupIds: ["group-1", "group-2"] }}
        subgroups={subgroups}
        knownTags={[]}
        onSaved={() => {}}
        onDeleted={() => {}}
        onClose={() => {}}
      />
    );

    const tutti = screen.getByRole("checkbox", { name: /Visibile a tutti/ }) as HTMLInputElement;
    const first = screen.getByRole("button", { name: "Gruppo uno" });
    const second = screen.getByRole("button", { name: "Gruppo due" });
    expect(tutti.checked).toBe(false);
    expect(first.className).toContain("choice-chip--active");
    expect(second.className).toContain("choice-chip--active");

    await user.click(tutti);
    expect(tutti.checked).toBe(true);
    expect(first.className).not.toContain("choice-chip--active");
    expect(second.className).not.toContain("choice-chip--active");
  });

  it("submits consistent edit audience data without changing bachecaOnly or event details", async () => {
    const user = userEvent.setup();
    const put = vi.spyOn(api, "put").mockResolvedValue({} as AppEvent);
    render(
      <EventModal
        draft={{
          ...draft,
          id: "event-1",
          title: "Riunione docenti",
          description: "Ordine del giorno",
          location: "Aula magna",
          bachecaOnly: true,
          tagNames: ["COLLEGIO"],
        }}
        subgroups={subgroups}
        knownTags={[]}
        onSaved={() => {}}
        onDeleted={() => {}}
        onClose={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: "Gruppo uno" }));
    await user.click(screen.getByRole("button", { name: "Gruppo due" }));
    await user.click(screen.getByRole("checkbox", { name: /Visibile a tutti/ }));
    await user.click(screen.getByRole("button", { name: "Gruppo uno" }));
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(put).toHaveBeenCalledWith(
      "/api/events/event-1",
      expect.objectContaining({
        title: "Riunione docenti",
        description: "Ordine del giorno",
        location: "Aula magna",
        isGlobal: false,
        subgroupIds: ["group-1"],
        bachecaOnly: true,
        tagNames: ["COLLEGIO"],
      })
    );
  });

  it("keeps saving disabled when Tutti is manually cleared without a subgroup", async () => {
    const user = userEvent.setup();
    render(
      <EventModal
        draft={draft}
        subgroups={subgroups}
        knownTags={[]}
        onSaved={() => {}}
        onDeleted={() => {}}
        onClose={() => {}}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: /Visibile a tutti/ }));
    expect((screen.getByRole("button", { name: "Salva" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps saving disabled for a board-only event with an empty targeted audience", () => {
    render(
      <EventModal
        draft={{ ...draft, isGlobal: false, bachecaOnly: true, subgroupIds: [] }}
        subgroups={subgroups}
        knownTags={[]}
        onSaved={() => {}}
        onDeleted={() => {}}
        onClose={() => {}}
      />
    );

    expect((screen.getByRole("button", { name: "Salva" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
