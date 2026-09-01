// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminResourcesApi, api } from "../api";
import type { AdminConfig, Subgroup, SyncLogEntry } from "../types";
import AdminSettings from "./AdminSettings";

const config: AdminConfig = {
  masterConnected: false,
  masterEmail: null,
  mainGroupEmail: null,
  calendarNameTemplate: "Calendario - {nome}",
  generalCalendarId: null,
  generalCalendarLastSyncAt: null,
  generalCalendarLastError: null,
  generalCalendarWatchExpiresAt: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminSettings tabs", () => {
  it("keeps both panels mounted after activation and preserves a resource draft", async () => {
    const user = userEvent.setup();
    const getSpy = vi.spyOn(api, "get").mockImplementation(((path: string) => {
      if (path === "/api/admin/config") return Promise.resolve(config);
      if (path === "/api/admin/synclogs") return Promise.resolve([] as SyncLogEntry[]);
      if (path === "/api/subgroups") return Promise.resolve([] as Subgroup[]);
      throw new Error(`Unexpected GET ${path}`);
    }) as typeof api.get);
    const listSpy = vi.spyOn(adminResourcesApi, "list").mockResolvedValue([]);

    const { container } = render(<AdminSettings />);
    expect(await screen.findByRole("heading", { name: "Impostazioni" })).toBeTruthy();

    const calendarTab = screen.getByRole("tab", { name: "Calendario" });
    const resourcesTab = screen.getByRole("tab", { name: "Risorse condivise" });
    expect(calendarTab.getAttribute("aria-selected")).toBe("true");
    expect(calendarTab.getAttribute("aria-controls")).toBe("settings-calendar-panel");
    expect(resourcesTab.getAttribute("aria-controls")).toBe("settings-resources-panel");

    calendarTab.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(document.activeElement).toBe(resourcesTab));
    await user.click(await screen.findByRole("button", { name: "Nuova risorsa" }));
    const title = screen.getByRole("textbox", { name: "Titolo" }) as HTMLInputElement;
    await user.type(title, "Bozza persistente");

    await user.click(calendarTab);
    expect(container.querySelector("#settings-resources-panel")?.hasAttribute("hidden")).toBe(true);
    expect(screen.getByRole("heading", { name: "Impostazioni" })).toBeTruthy();
    await user.click(resourcesTab);

    expect((screen.getByRole("textbox", { name: "Titolo" }) as HTMLInputElement).value).toBe("Bozza persistente");
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(getSpy.mock.calls.filter(([path]) => path === "/api/admin/config")).toHaveLength(1);
    expect(resourcesTab.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector("#settings-resources-panel")?.getAttribute("aria-labelledby")).toBe("settings-resources-tab");
  });
});
