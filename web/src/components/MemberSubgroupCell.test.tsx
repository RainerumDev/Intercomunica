// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member, Subgroup } from "../types";
import MemberSubgroupCell from "./MemberSubgroupCell";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MemberSubgroupCell picker", () => {
  it("keeps a right-edge picker inside a 390px viewport", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    const member: Member = {
      id: "member-1",
      email: "docente@example.edu",
      name: "Docente",
      role: "TEACHER",
      subgroups: [],
    };
    const subgroup: Subgroup = {
      id: "group-1",
      name: "Gruppo uno",
      description: null,
      color: null,
      members: [],
    };

    render(
      <MemberSubgroupCell
        member={member}
        allSubgroups={[subgroup]}
        isAdmin
        onAdd={() => {}}
        onRemove={() => {}}
      />
    );
    const trigger = screen.getByTitle("Aggiungi a un sottogruppo");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 370,
      y: 100,
      top: 100,
      right: 394,
      bottom: 124,
      left: 370,
      width: 24,
      height: 24,
      toJSON: () => ({}),
    });

    await user.click(trigger);

    const picker = screen.getByPlaceholderText("Cerca sottogruppo…").closest(".popover-panel") as HTMLDivElement;
    expect(picker.style.maxWidth).toBe("calc(100vw - 1rem)");
    expect(Number.parseFloat(picker.style.left) + 256).toBeLessThanOrEqual(382);
  });
});
