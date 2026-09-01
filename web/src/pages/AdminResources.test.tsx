// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminResourcesApi, api } from "../api";
import type { SharedResource, Subgroup } from "../types";
import AdminResources from "./AdminResources";

function resource(id: string, title: string, sortOrder: number): SharedResource {
  return {
    id,
    url: `https://${id}.example.org`,
    title,
    description: null,
    previewEnabled: false,
    previewImageUrl: null,
    previewSiteName: null,
    previewFetchedAt: null,
    isGlobal: true,
    sortOrder,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    subgroupIds: [],
  };
}

const first = resource("first", "Prima", 0);
const second = resource("second", "Seconda", 1);
const third = resource("third", "Terza", 2);

beforeEach(() => {
  vi.spyOn(api, "get").mockResolvedValue([] as Subgroup[]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminResources", () => {
  it("offers a retry after the initial collection load fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminResourcesApi, "list")
      .mockRejectedValueOnce(new Error("Caricamento fallito"))
      .mockResolvedValueOnce([first]);
    render(<AdminResources />);

    expect((await screen.findByRole("alert")).textContent).toContain("Caricamento fallito");
    await user.click(screen.getByRole("button", { name: "Riprova" }));

    expect(await screen.findByRole("heading", { name: "Prima" })).toBeTruthy();
  });

  it("submits the complete order, disables boundaries, and rolls the rendered list back on failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminResourcesApi, "list").mockResolvedValue([first, second, third]);
    const reorder = vi.spyOn(adminResourcesApi, "reorder").mockRejectedValue(new Error("Riordino fallito"));
    render(<AdminResources />);

    const cards = await screen.findAllByRole("article");
    expect((within(cards[0]).getByRole("button", { name: "Sposta su" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(cards[2]).getByRole("button", { name: "Sposta giù" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(within(cards[1]).getByRole("button", { name: "Sposta su" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Riordino fallito");
    expect(reorder).toHaveBeenCalledWith(["second", "first", "third"]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Prima",
      "Seconda",
      "Terza",
    ]);
  });

  it("removes a deleted item immediately and keeps it gone when the refresh fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(adminResourcesApi, "list")
      .mockResolvedValueOnce([first])
      .mockRejectedValueOnce(new Error("Aggiornamento fallito"));
    vi.spyOn(adminResourcesApi, "remove").mockResolvedValue({ ok: true });
    render(<AdminResources />);

    const card = await screen.findByRole("article");
    await user.click(within(card).getByRole("button", { name: "Modifica" }));
    expect(screen.getByRole("heading", { name: "Modifica risorsa" })).toBeTruthy();
    await user.click(within(card).getByRole("button", { name: "Elimina" }));

    await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
    expect(screen.queryByRole("heading", { name: "Modifica risorsa" })).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain("Aggiornamento fallito");
    expect(screen.queryByText("Prima")).toBeNull();
  });

  it("keeps a draft and the list actionable when create fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminResourcesApi, "list").mockResolvedValue([]);
    vi.spyOn(adminResourcesApi, "create").mockRejectedValue(new Error("Creazione fallita"));
    render(<AdminResources />);

    await user.click(await screen.findByRole("button", { name: "Nuova risorsa" }));
    await user.type(screen.getByRole("textbox", { name: "URL" }), "https://resource.example.org");
    await user.type(screen.getByRole("textbox", { name: "Titolo" }), "Bozza non persa");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Creazione fallita");
    expect((screen.getByRole("textbox", { name: "Titolo" }) as HTMLInputElement).value).toBe("Bozza non persa");
    expect(screen.getByText("Nessuna risorsa condivisa. Aggiungi il primo link per iniziare.")).toBeTruthy();
  });
});
