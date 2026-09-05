// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Subgroup } from "../types";
import GroupDirectory, { type GroupDirectorySection } from "./GroupDirectory";

const subgroup: Subgroup = {
  id: "group-5l",
  name: "CDC 5 Liceo",
  description: "Consiglio della classe quinta",
  folder: "Consigli di Classe · Liceo",
  color: "#1D4ED8",
  members: Array.from({ length: 11 }, (_, index) => ({
    id: `member-${index}`,
    email: `member-${index}@example.edu`,
    name: `Docente ${index}`,
  })),
};

const sections: GroupDirectorySection[] = [{ label: "Consigli di Classe · Liceo", groups: [subgroup] }];

afterEach(cleanup);

describe("GroupDirectory", () => {
  it("renders folder, group metadata, color indicator, complete count, and selected state", () => {
    render(<GroupDirectory sections={sections} selectedId="group-5l" onSelect={() => undefined} />);

    const region = screen.getByRole("region", { name: "Consigli di Classe · Liceo" });
    expect(region.querySelector("h3")?.id).not.toMatch(/\s/u);
    expect(region.getAttribute("aria-labelledby")).toBe(region.querySelector("h3")?.id);
    const row = screen.getByRole("button", {
      name: "CDC 5 Liceo",
      description: "Consiglio della classe quinta 11 membri",
    });
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Consiglio della classe quinta")).not.toBeNull();
    expect(screen.getByText("11 membri")).not.toBeNull();
    expect(screen.getByTestId("group-color-indicator").getAttribute("style")).toContain("background-color");
  });

  it("selects the requested group and exposes empty groups", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const empty = { ...subgroup, id: "empty", name: "Gruppo vuoto", members: [] };
    render(<GroupDirectory sections={[{ label: "Generale", groups: [empty, subgroup] }]} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /CDC 5 Liceo/ }));
    expect(onSelect).toHaveBeenCalledWith("group-5l", expect.any(HTMLButtonElement));
    expect(screen.getByText("0 membri")).not.toBeNull();
  });
});
