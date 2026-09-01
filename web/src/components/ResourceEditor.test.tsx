// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminResourcesApi, type ResourcePreview } from "../api";
import type { Subgroup } from "../types";
import { emptyResourceDraft } from "./resourceForm";
import ResourceEditor from "./ResourceEditor";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const preview = (title: string, finalUrl: string): ResourcePreview => ({
  finalUrl,
  title,
  description: `${title} description`,
  imageUrl: null,
  siteName: `${title} site`,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ResourceEditor", () => {
  it("removes unavailable subgroup IDs while preserving the rest of the edited draft", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    const stale: Subgroup = { id: "stale", name: "Stale", description: null, members: [] };
    const retained: Subgroup = { id: "retained", name: "Retained", description: null, members: [] };
    const replacement: Subgroup = { id: "replacement", name: "Replacement", description: null, members: [] };
    const { rerender } = render(
      <ResourceEditor
        initialDraft={{
          ...emptyResourceDraft,
          url: "https://resource.example.org",
          title: "Titolo iniziale",
          description: "Descrizione iniziale",
          previewEnabled: true,
          previewImageUrl: "https://images.example.org/preview.png",
          previewSiteName: "Sito iniziale",
          isGlobal: false,
          subgroupIds: ["stale", "retained"],
        }}
        subgroups={[stale, retained]}
        onSave={onSave}
        onCancel={() => {}}
      />
    );

    const title = screen.getByRole("textbox", { name: "Titolo" });
    const description = screen.getByRole("textbox", { name: "Descrizione" });
    await user.clear(title);
    await user.type(title, "Titolo modificato");
    await user.clear(description);
    await user.type(description, "Descrizione modificata");

    rerender(
      <ResourceEditor
        initialDraft={emptyResourceDraft}
        subgroups={[retained, replacement]}
        onSave={onSave}
        onCancel={() => {}}
      />
    );

    expect(screen.queryByRole("checkbox", { name: "Stale" })).toBeNull();
    expect((screen.getByRole("checkbox", { name: "Retained" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Replacement" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("textbox", { name: "Titolo" }) as HTMLInputElement).value).toBe("Titolo modificato");
    expect((screen.getByRole("textbox", { name: "Descrizione" }) as HTMLTextAreaElement).value)
      .toBe("Descrizione modificata");

    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(onSave).toHaveBeenCalledWith({
      url: "https://resource.example.org",
      title: "Titolo modificato",
      description: "Descrizione modificata",
      previewEnabled: true,
      previewImageUrl: null,
      previewSiteName: "Sito iniziale",
      isGlobal: false,
      subgroupIds: ["retained"],
    });
  });

  it("requires a replacement access target when refreshed subgroups remove every selection", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    const stale: Subgroup = { id: "stale", name: "Stale", description: null, members: [] };
    const replacement: Subgroup = { id: "replacement", name: "Replacement", description: null, members: [] };
    const { rerender } = render(
      <ResourceEditor
        initialDraft={{
          ...emptyResourceDraft,
          url: "https://resource.example.org",
          title: "Titolo",
          isGlobal: false,
          subgroupIds: ["stale"],
        }}
        subgroups={[stale]}
        onSave={onSave}
        onCancel={() => {}}
      />
    );

    rerender(
      <ResourceEditor
        initialDraft={emptyResourceDraft}
        subgroups={[replacement]}
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    await user.click(screen.getByRole("button", { name: "Salva" }));

    const subgroupFieldset = screen.getByRole("group", { name: "Sottogruppi destinatari" });
    expect(subgroupFieldset.getAttribute("aria-invalid")).toBe("true");
    expect(subgroupFieldset.getAttribute("aria-describedby")).toBe("resource-subgroups-error");
    expect(screen.getByText("Seleziona almeno un sottogruppo.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps the latest URL and edits when an older preview resolves last", async () => {
    const user = userEvent.setup();
    const first = deferred<ResourcePreview>();
    const second = deferred<ResourcePreview>();
    vi.spyOn(adminResourcesApi, "preview")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(
      <ResourceEditor
        initialDraft={emptyResourceDraft}
        subgroups={[]}
        onSave={async () => {}}
        onCancel={() => {}}
      />
    );

    const url = screen.getByRole("textbox", { name: "URL" }) as HTMLInputElement;
    const title = screen.getByRole("textbox", { name: "Titolo" }) as HTMLInputElement;
    await user.type(url, "https://old.example.org/page");
    await user.click(screen.getByRole("button", { name: "Genera anteprima" }));
    await user.clear(url);
    await user.type(url, "https://new.example.org/page");
    await user.click(screen.getByRole("button", { name: "Genera anteprima" }));

    await act(async () => second.resolve(preview("New", "https://new.example.org/final")));
    await user.clear(title);
    await user.type(title, "Titolo scelto dall'admin");
    await act(async () => first.resolve(preview("Old", "https://old.example.org/final")));

    await waitFor(() => {
      expect(url.value).toBe("https://new.example.org/final");
      expect(title.value).toBe("Titolo scelto dall'admin");
    });
  });

  it("clears an obsolete preview error when the URL changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminResourcesApi, "preview").mockRejectedValue(new Error("Anteprima non disponibile"));

    render(
      <ResourceEditor
        initialDraft={emptyResourceDraft}
        subgroups={[]}
        onSave={async () => {}}
        onCancel={() => {}}
      />
    );

    const url = screen.getByRole("textbox", { name: "URL" });
    await user.type(url, "https://broken.example.org");
    await user.click(screen.getByRole("button", { name: "Genera anteprima" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Anteprima non disponibile");

    await user.clear(url);
    await user.type(url, "https://fixed.example.org");

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not re-enable preview after the admin disables it while the request is pending", async () => {
    const user = userEvent.setup();
    const pending = deferred<ResourcePreview>();
    vi.spyOn(adminResourcesApi, "preview").mockReturnValue(pending.promise);

    render(
      <ResourceEditor
        initialDraft={{
          ...emptyResourceDraft,
          url: "https://resource.example.org",
          title: "Titolo iniziale",
          previewEnabled: true,
        }}
        subgroups={[]}
        onSave={async () => {}}
        onCancel={() => {}}
      />
    );

    const previewToggle = screen.getByRole("checkbox", { name: "Mostra anteprima" }) as HTMLInputElement;
    await user.click(screen.getByRole("button", { name: "Genera anteprima" }));
    await user.click(previewToggle);
    await act(async () => pending.resolve(preview("Retrieved", "https://resource.example.org/final")));

    expect(previewToggle.checked).toBe(false);
  });

  it("clears server preview metadata on URL change and ignores the delayed response", async () => {
    const user = userEvent.setup();
    const pending = deferred<ResourcePreview>();
    const onSave = vi.fn(async () => {});
    vi.spyOn(adminResourcesApi, "preview").mockReturnValue(pending.promise);

    render(
      <ResourceEditor
        initialDraft={{
          ...emptyResourceDraft,
          url: "https://old.example.org/page",
          title: "Titolo manuale",
          previewEnabled: true,
          previewImageUrl: "https://images.example.org/old.png",
          previewSiteName: "Old site",
        }}
        subgroups={[]}
        onSave={onSave}
        onCancel={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: "Genera anteprima" }));
    const url = screen.getByRole("textbox", { name: "URL" });
    await user.clear(url);
    await user.type(url, "https://new.example.org/page");

    expect(screen.queryByText("Old site")).toBeNull();
    expect(screen.getByText("new.example.org")).toBeTruthy();
    await act(async () => pending.resolve({
      ...preview("Delayed", "https://old.example.org/final"),
      imageUrl: "https://images.example.org/delayed.png",
    }));
    expect(screen.queryByText("Delayed site")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://new.example.org/page",
      previewImageUrl: null,
      previewSiteName: null,
    }));
  });

  it("clears preview metadata when preview is disabled and a pending response cannot restore it", async () => {
    const user = userEvent.setup();
    const pending = deferred<ResourcePreview>();
    const onSave = vi.fn(async () => {});
    vi.spyOn(adminResourcesApi, "preview").mockReturnValue(pending.promise);

    render(
      <ResourceEditor
        initialDraft={{
          ...emptyResourceDraft,
          url: "https://resource.example.org/page",
          title: "Titolo manuale",
          previewEnabled: true,
          previewImageUrl: "https://images.example.org/old.png",
          previewSiteName: "Old site",
        }}
        subgroups={[]}
        onSave={onSave}
        onCancel={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: "Genera anteprima" }));
    await user.click(screen.getByRole("checkbox", { name: "Mostra anteprima" }));
    expect(screen.queryByText("Old site")).toBeNull();
    expect(screen.getByText("resource.example.org")).toBeTruthy();

    await act(async () => pending.resolve({
      ...preview("Delayed", "https://resource.example.org/final"),
      imageUrl: "https://images.example.org/delayed.png",
    }));
    expect(screen.queryByText("Delayed site")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      previewEnabled: false,
      previewImageUrl: null,
      previewSiteName: null,
    }));
  });

  it("never renders a remote preview image in the live card", () => {
    render(
      <ResourceEditor
        initialDraft={{
          ...emptyResourceDraft,
          url: "https://resource.example.org/page",
          title: "Titolo",
          previewEnabled: true,
          previewImageUrl: "https://images.example.org/preview.png",
          previewSiteName: "Example",
        }}
        subgroups={[]}
        onSave={async () => {}}
        onCancel={() => {}}
      />
    );

    expect(document.querySelector("img")).toBeNull();
  });

  it("preserves title clearing and description edits made while preview is pending", async () => {
    const user = userEvent.setup();
    const pending = deferred<ResourcePreview>();
    vi.spyOn(adminResourcesApi, "preview").mockReturnValue(pending.promise);

    render(
      <ResourceEditor
        initialDraft={{
          ...emptyResourceDraft,
          url: "https://resource.example.org",
          title: "Titolo da cancellare",
          description: "Descrizione iniziale",
        }}
        subgroups={[]}
        onSave={async () => {}}
        onCancel={() => {}}
      />
    );

    const title = screen.getByRole("textbox", { name: "Titolo" }) as HTMLInputElement;
    const description = screen.getByRole("textbox", { name: "Descrizione" }) as HTMLTextAreaElement;
    await user.click(screen.getByRole("button", { name: "Genera anteprima" }));
    await user.clear(title);
    await user.clear(description);
    await user.type(description, "Descrizione scelta dall'admin");
    await act(async () => pending.resolve(preview("Retrieved", "https://resource.example.org/final")));

    expect(title.value).toBe("");
    expect(description.value).toBe("Descrizione scelta dall'admin");
  });

  it("reports invalid URL, missing title, and missing subgroup accessibly on submit", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    render(
      <ResourceEditor
        initialDraft={emptyResourceDraft}
        subgroups={[{ id: "group-1", name: "Lettere", description: null, members: [] }]}
        onSave={onSave}
        onCancel={() => {}}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Per tutti" }));
    await user.click(screen.getByRole("button", { name: "Salva" }));

    const url = screen.getByRole("textbox", { name: "URL" });
    const title = screen.getByRole("textbox", { name: "Titolo" });
    const subgroupFieldset = screen.getByRole("group", { name: "Sottogruppi destinatari" });
    expect(url.getAttribute("aria-invalid")).toBe("true");
    expect(url.getAttribute("aria-describedby")).toBe("resource-url-error");
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(title.getAttribute("aria-describedby")).toBe("resource-title-error");
    expect(subgroupFieldset.getAttribute("aria-invalid")).toBe("true");
    expect(subgroupFieldset.getAttribute("aria-describedby")).toBe("resource-subgroups-error");
    expect(screen.getByText("Inserisci un URL HTTP o HTTPS valido.")).toBeTruthy();
    expect(screen.getByText("Inserisci un titolo.")).toBeTruthy();
    expect(screen.getByText("Seleziona almeno un sottogruppo.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
