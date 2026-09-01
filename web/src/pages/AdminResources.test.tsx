// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminResourcesApi, api, ApiError } from "../api";
import type { SharedResource, Subgroup } from "../types";
import AdminResources from "./AdminResources";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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

  it("refreshes authoritative order after a stale reorder conflict", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminResourcesApi, "list")
      .mockResolvedValueOnce([first, second, third])
      .mockResolvedValueOnce([third, first]);
    vi.spyOn(adminResourcesApi, "reorder").mockRejectedValue(
      new ApiError(409, "Ordine delle risorse non valido")
    );
    render(<AdminResources />);

    const cards = await screen.findAllByRole("article");
    await user.click(within(cards[1]).getByRole("button", { name: "Sposta su" }));

    await waitFor(() => expect(
      screen.getAllByRole("article").map((card) => within(card).getByRole("heading", { level: 3 }).textContent)
    ).toEqual(["Terza", "Prima"]));
  });

  it("treats a reorder 404 as an authoritative collection conflict", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminResourcesApi, "list")
      .mockResolvedValueOnce([first, second, third])
      .mockResolvedValueOnce([third, first]);
    vi.spyOn(adminResourcesApi, "reorder").mockRejectedValue(
      new ApiError(404, "Risorsa non trovata")
    );
    render(<AdminResources />);

    const cards = await screen.findAllByRole("article");
    await user.click(within(cards[1]).getByRole("button", { name: "Modifica" }));
    expect(screen.getByRole("heading", { name: "Modifica risorsa" })).toBeTruthy();
    await user.click(within(cards[1]).getByRole("button", { name: "Sposta su" }));

    expect((await screen.findByRole("alert")).textContent).toContain("raccolta è cambiata");
    await waitFor(() => expect(
      screen.getAllByRole("link").map((link) =>
        within(link).getByRole("heading", { level: 3 }).textContent
      )
    ).toEqual(["Terza", "Prima"]));
    expect(screen.queryByRole("heading", { name: "Modifica risorsa" })).toBeNull();
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

  it("inserts the resource returned by a successful create", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminResourcesApi, "list").mockResolvedValue([]);
    vi.spyOn(adminResourcesApi, "create").mockResolvedValue(resource("created", "Titolo normalizzato", 0));
    render(<AdminResources />);

    await user.click(await screen.findByRole("button", { name: "Nuova risorsa" }));
    await user.type(screen.getByRole("textbox", { name: "URL" }), "https://created.example.org");
    await user.type(screen.getByRole("textbox", { name: "Titolo" }), "Titolo inviato");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(await screen.findByRole("heading", { name: "Titolo normalizzato" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Nuova risorsa" })).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("replaces the edited resource with the successful update response", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminResourcesApi, "list").mockResolvedValue([first]);
    vi.spyOn(adminResourcesApi, "update").mockResolvedValue({ ...first, title: "Prima aggiornata dal server" });
    render(<AdminResources />);

    const card = await screen.findByRole("article");
    await user.click(within(card).getByRole("button", { name: "Modifica" }));
    const title = screen.getByRole("textbox", { name: "Titolo" });
    await user.clear(title);
    await user.type(title, "Prima inviata");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(await screen.findByRole("heading", { name: "Prima aggiornata dal server" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Prima" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Modifica risorsa" })).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("retires a missing edited resource and keeps an accessible explanation after update 404", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminResourcesApi, "list")
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([second]);
    vi.spyOn(adminResourcesApi, "update").mockRejectedValue(
      new ApiError(404, "Risorsa non trovata")
    );
    render(<AdminResources />);

    const cards = await screen.findAllByRole("article");
    await user.click(within(cards[0]).getByRole("button", { name: "Modifica" }));
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect((await screen.findByRole("alert")).textContent).toContain("non esiste più");
    expect(screen.queryByRole("heading", { name: "Modifica risorsa" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Prima" })).toBeNull();
    expect(await screen.findByRole("heading", { name: "Seconda" })).toBeTruthy();
  });

  it("retires a missing card and refreshes the collection after delete 404", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(adminResourcesApi, "list")
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([second]);
    vi.spyOn(adminResourcesApi, "remove").mockRejectedValue(
      new ApiError(404, "Risorsa non trovata")
    );
    render(<AdminResources />);

    const cards = await screen.findAllByRole("article");
    await user.click(within(cards[0]).getByRole("button", { name: "Elimina" }));

    expect((await screen.findByRole("alert")).textContent).toContain("non esiste più");
    expect(screen.queryByRole("heading", { name: "Prima" })).toBeNull();
    expect(await screen.findByRole("heading", { name: "Seconda" })).toBeTruthy();
  });

  it("uses the page mutation lock to prevent reorder and other actions during create", async () => {
    const user = userEvent.setup();
    const create = deferred<SharedResource>();
    vi.spyOn(adminResourcesApi, "list").mockResolvedValue([first, second]);
    vi.spyOn(adminResourcesApi, "create").mockReturnValue(create.promise);
    const reorder = vi.spyOn(adminResourcesApi, "reorder").mockResolvedValue([second, first]);
    render(<AdminResources />);

    await user.click(await screen.findByRole("button", { name: "Nuova risorsa" }));
    await user.type(screen.getByRole("textbox", { name: "URL" }), "https://created.example.org");
    await user.type(screen.getByRole("textbox", { name: "Titolo" }), "Creazione in corso");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    const firstCard = screen.getByRole("heading", { name: "Prima" }).closest("article");
    if (!firstCard) throw new Error("First resource card not found");
    const moveDown = within(firstCard).getByRole("button", { name: "Sposta giù" }) as HTMLButtonElement;
    expect(moveDown.disabled).toBe(true);
    expect((within(firstCard).getByRole("button", { name: "Modifica" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(firstCard).getByRole("button", { name: "Elimina" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Annulla" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(moveDown);
    expect(reorder).not.toHaveBeenCalled();

    await act(async () => create.resolve(resource("created", "Creata", 2)));
    expect(await screen.findByRole("heading", { name: "Creata" })).toBeTruthy();
  });

  it("uses the page mutation lock to prevent reorder and other actions during update", async () => {
    const user = userEvent.setup();
    const update = deferred<SharedResource>();
    vi.spyOn(adminResourcesApi, "list").mockResolvedValue([first, second]);
    vi.spyOn(adminResourcesApi, "update").mockReturnValue(update.promise);
    const reorder = vi.spyOn(adminResourcesApi, "reorder").mockResolvedValue([second, first]);
    render(<AdminResources />);

    const cards = await screen.findAllByRole("article");
    await user.click(within(cards[0]).getByRole("button", { name: "Modifica" }));
    await user.click(screen.getByRole("button", { name: "Salva" }));

    const moveDown = within(cards[0]).getByRole("button", { name: "Sposta giù" }) as HTMLButtonElement;
    expect(moveDown.disabled).toBe(true);
    expect((within(cards[1]).getByRole("button", { name: "Modifica" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(cards[1]).getByRole("button", { name: "Elimina" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(moveDown);
    expect(reorder).not.toHaveBeenCalled();

    await act(async () => update.resolve({ ...first, title: "Prima aggiornata" }));
    expect(await screen.findByRole("heading", { name: "Prima aggiornata" })).toBeTruthy();
  });

  it("drops a stale audience after a conflict and retries with only the selected replacement", async () => {
    const user = userEvent.setup();
    const targeted = { ...first, isGlobal: false, subgroupIds: ["old-group"] };
    const authoritative = { ...targeted, title: "Prima autoritativa", subgroupIds: ["new-group"] };
    const oldSubgroup: Subgroup = {
      id: "old-group", name: "Gruppo eliminato", description: null, members: [],
    };
    const newSubgroup: Subgroup = {
      id: "new-group", name: "Gruppo disponibile", description: null, members: [],
    };
    vi.spyOn(adminResourcesApi, "list")
      .mockResolvedValueOnce([targeted, second])
      .mockResolvedValueOnce([authoritative]);
    vi.mocked(api.get)
      .mockResolvedValueOnce([oldSubgroup])
      .mockResolvedValueOnce([newSubgroup]);
    const update = vi.spyOn(adminResourcesApi, "update")
      .mockRejectedValueOnce(
        new ApiError(409, "Uno o più sottogruppi selezionati non esistono più", "RESOURCE_AUDIENCE_CONFLICT")
      )
      .mockResolvedValueOnce({ ...authoritative, title: "Bozza preservata" });
    render(<AdminResources />);

    const cards = await screen.findAllByRole("article");
    await user.click(within(cards[0]).getByRole("button", { name: "Modifica" }));
    const title = screen.getByRole("textbox", { name: "Titolo" });
    await user.clear(title);
    await user.type(title, "Bozza preservata");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect((await screen.findByRole("alert")).textContent).toContain("non esistono più");
    expect((screen.getByRole("textbox", { name: "Titolo" }) as HTMLInputElement).value).toBe("Bozza preservata");
    expect(await screen.findByRole("heading", { name: "Prima autoritativa" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Seconda" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Gruppo eliminato" })).toBeNull();
    const replacement = screen.getByRole("checkbox", { name: "Gruppo disponibile" });
    expect((replacement as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("Seleziona almeno un sottogruppo.")).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2);

    await user.click(replacement);
    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      title: "Bozza preservata",
      subgroupIds: ["new-group"],
    }));
    expect(update.mock.calls[1]?.[1].subgroupIds).not.toContain("old-group");
  });

  it("keeps remaining resource controls disabled until the post-delete refresh settles", async () => {
    const user = userEvent.setup();
    const refresh = deferred<SharedResource[]>();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(adminResourcesApi, "list")
      .mockResolvedValueOnce([first, second])
      .mockReturnValueOnce(refresh.promise);
    vi.spyOn(adminResourcesApi, "remove").mockResolvedValue({ ok: true });
    render(<AdminResources />);

    const cards = await screen.findAllByRole("article");
    await user.click(within(cards[0]).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    const remainingEdit = within(screen.getByRole("article")).getByRole("button", { name: "Modifica" }) as HTMLButtonElement;
    const newResource = screen.getByRole("button", { name: "Nuova risorsa" }) as HTMLButtonElement;
    expect(remainingEdit.disabled).toBe(true);
    expect(newResource.disabled).toBe(true);

    await act(async () => refresh.resolve([second]));
    await waitFor(() => {
      expect(remainingEdit.disabled).toBe(false);
      expect(newResource.disabled).toBe(false);
    });
  });

  it("locks an open editor and its submit handler during a manual refresh retry", async () => {
    const user = userEvent.setup();
    const retryRefresh = deferred<SharedResource[]>();
    const retrySubgroups = deferred<Subgroup[]>();
    const initialSubgroup: Subgroup = {
      id: "old-group", name: "Gruppo iniziale", description: null, members: [],
    };
    const refreshedSubgroup: Subgroup = {
      id: "new-group", name: "Gruppo aggiornato", description: null, members: [],
    };
    const targetedFirst = { ...first, isGlobal: false, subgroupIds: [initialSubgroup.id] };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(adminResourcesApi, "list")
      .mockResolvedValueOnce([targetedFirst, second])
      .mockRejectedValueOnce(new Error("Aggiornamento fallito"))
      .mockReturnValueOnce(retryRefresh.promise);
    vi.spyOn(adminResourcesApi, "remove").mockResolvedValue({ ok: true });
    vi.mocked(api.get)
      .mockResolvedValueOnce([initialSubgroup])
      .mockReturnValueOnce(retrySubgroups.promise);
    const update = vi.spyOn(adminResourcesApi, "update").mockResolvedValue(first);
    render(<AdminResources />);

    const cards = await screen.findAllByRole("article");
    await user.click(within(cards[0]).getByRole("button", { name: "Modifica" }));
    await user.click(within(cards[1]).getByRole("button", { name: "Elimina" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Aggiornamento fallito");

    await user.click(screen.getByRole("button", { name: "Riprova aggiornamento" }));
    const save = screen.getByRole("button", { name: "Salva" }) as HTMLButtonElement;
    const cancel = screen.getByRole("button", { name: "Annulla" }) as HTMLButtonElement;
    const previewButton = screen.getByRole("button", { name: "Genera anteprima" }) as HTMLButtonElement;
    await waitFor(() => {
      expect(save.disabled).toBe(true);
      expect(cancel.disabled).toBe(true);
      expect(previewButton.disabled).toBe(true);
    });

    const form = screen.getByRole("heading", { name: "Modifica risorsa" }).closest("section")?.querySelector("form");
    if (!form) throw new Error("Editor form not found");
    fireEvent.submit(form);
    expect(update).not.toHaveBeenCalled();

    await act(async () => retryRefresh.resolve([targetedFirst]));
    expect(save.disabled).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(2);
    await act(async () => retrySubgroups.resolve([refreshedSubgroup]));
    await waitFor(() => {
      expect(save.disabled).toBe(false);
      expect(cancel.disabled).toBe(false);
      expect(previewButton.disabled).toBe(false);
    });
    expect(screen.queryByRole("checkbox", { name: "Gruppo iniziale" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Gruppo aggiornato" })).toBeTruthy();
  });
});
