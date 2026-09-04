// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DirectoryTabs from "./DirectoryTabs";

afterEach(cleanup);

describe("DirectoryTabs", () => {
  it("exposes controlled tabs and changes only through onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DirectoryTabs
        tab="groups"
        teacherCount={12}
        groupCount={4}
        onChange={onChange}
      />
    );

    const teachers = screen.getByRole("tab", { name: "Docenti 12" });
    const groups = screen.getByRole("tab", { name: "Gruppi 4" });
    expect(groups.getAttribute("aria-selected")).toBe("true");
    expect(groups.getAttribute("aria-controls")).toBe("directory-panel-groups");
    expect(teachers.getAttribute("aria-selected")).toBe("false");
    expect(teachers.getAttribute("aria-controls")).toBe("directory-panel-teachers");

    await user.click(teachers);

    expect(onChange).toHaveBeenCalledWith("teachers");
    expect(groups.getAttribute("aria-selected")).toBe("true");
  });

  it("moves focus and activates tabs with arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DirectoryTabs
        tab="groups"
        teacherCount={12}
        groupCount={4}
        onChange={onChange}
      />
    );

    const groups = screen.getByRole("tab", { name: "Gruppi 4" });
    const teachers = screen.getByRole("tab", { name: "Docenti 12" });
    groups.focus();
    await user.keyboard("{ArrowLeft}");

    expect(document.activeElement).toBe(teachers);
    expect(onChange).toHaveBeenCalledWith("teachers");
  });
});
