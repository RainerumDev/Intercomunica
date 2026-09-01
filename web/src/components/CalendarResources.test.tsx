// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CalendarResources, confirmRotation } from "./CalendarResources";
import type { CalendarLinks } from "../types";

const links: CalendarLinks = {
  generalGoogleUrl: "https://calendar.google.com/calendar/embed?src=shared%40example.com",
  personalIcsUrl: "https://intercomunica.example/calendar/feed/mario-secret.ics",
  personalWebcalUrl: "webcal://intercomunica.example/calendar/feed/mario-secret.ics",
  personalFeedEligible: true,
  lastFetchedAt: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text
  );
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button not found: ${text}`);
  return button;
}

describe("CalendarResources", () => {
  it("keeps both calendar choices visible and sends the general choice to Google", () => {
    const html = renderToStaticMarkup(
      <CalendarResources links={links} onRotate={async () => links} />
    );

    expect(html).toContain("Collega calendario generale");
    expect(html).toContain("Collega il mio calendario");
    expect(html).toContain("calendar.google.com");
  });

  it("explains unavailable links instead of removing their choices", () => {
    const html = renderToStaticMarkup(
      <CalendarResources
        links={{
          generalGoogleUrl: null,
          personalIcsUrl: null,
          personalWebcalUrl: null,
          personalFeedEligible: false,
          lastFetchedAt: null,
        }}
        onRotate={async () => links}
      />
    );

    expect(html).toContain("Collega calendario generale");
    expect(html).toContain("Calendario generale non configurato");
    expect(html).toContain("Collega il mio calendario");
    expect(html).toContain("Il tuo calendario personale non è disponibile");
  });

  it("keeps both actions visible while links are loading or unavailable", () => {
    const html = renderToStaticMarkup(
      <CalendarResources
        links={{
          generalGoogleUrl: null,
          personalIcsUrl: null,
          personalWebcalUrl: null,
          personalFeedEligible: false,
          lastFetchedAt: null,
        }}
        statusMessage="Caricamento collegamenti calendario…"
        onRotate={async () => links}
      />
    );

    expect(html).toContain("Collega calendario generale");
    expect(html).toContain("Collega il mio calendario");
    expect(html).toContain("Caricamento collegamenti calendario…");
  });
});

describe("confirmRotation", () => {
  it("does not rotate a link when confirmation is rejected", async () => {
    let rotated = false;

    await confirmRotation(
      () => false,
      async () => {
        rotated = true;
      }
    );

    expect(rotated).toBe(false);
  });
});

describe("CalendarResources personal dialog", () => {
  it("keeps keyboard focus inside the dialog and restores the trigger for every close path", async () => {
    await act(async () => {
      root.render(<CalendarResources links={links} onRotate={async () => links} />);
    });

    const trigger = buttonByText("Collega il mio calendario");
    const openDialog = async () => {
      await act(async () => trigger.click());
      const dialog = container.querySelector('[role="dialog"]');
      if (!(dialog instanceof HTMLDivElement)) throw new Error("Dialog not found");
      return dialog;
    };

    let dialog = await openDialog();
    const closeButton = dialog.querySelector('button[aria-label="Chiudi"]');
    if (!(closeButton instanceof HTMLButtonElement)) throw new Error("Close button not found");
    const rotateButton = Array.from(dialog.querySelectorAll("button")).find(
      (button) => button.textContent === "Rigenera collegamento"
    );
    if (!(rotateButton instanceof HTMLButtonElement)) throw new Error("Rotate button not found");

    expect(document.activeElement).toBe(closeButton);

    rotateButton.focus();
    await act(async () => {
      rotateButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(closeButton);

    closeButton.focus();
    await act(async () => {
      closeButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(rotateButton);

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    dialog = await openDialog();
    await act(async () => dialog.parentElement?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    dialog = await openDialog();
    const closeAgain = dialog.querySelector('button[aria-label="Chiudi"]');
    if (!(closeAgain instanceof HTMLButtonElement)) throw new Error("Close button not found");
    await act(async () => closeAgain.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("traps Tab when a pending rotation disables the focused final control", async () => {
    let resolveRotation: (value: CalendarLinks) => void = () => {};
    const pendingRotation = new Promise<CalendarLinks>((resolve) => {
      resolveRotation = resolve;
    });
    const originalConfirm = window.confirm;
    window.confirm = () => true;

    try {
      await act(async () => {
        root.render(<CalendarResources links={links} onRotate={() => pendingRotation} />);
      });

      const trigger = buttonByText("Collega il mio calendario");
      await act(async () => trigger.click());
      const dialog = container.querySelector('[role="dialog"]');
      if (!(dialog instanceof HTMLDivElement)) throw new Error("Dialog not found");
      const rotateButton = Array.from(dialog.querySelectorAll("button")).find(
        (button) => button.textContent === "Rigenera collegamento"
      );
      const closeButton = dialog.querySelector('button[aria-label="Chiudi"]');
      if (!(rotateButton instanceof HTMLButtonElement) || !(closeButton instanceof HTMLButtonElement)) {
        throw new Error("Dialog controls not found");
      }

      rotateButton.focus();
      await act(async () => rotateButton.click());
      expect(rotateButton.disabled).toBe(true);
      expect(document.activeElement).toBe(rotateButton);

      await act(async () => {
        rotateButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      });
      expect(document.activeElement).toBe(closeButton);
    } finally {
      await act(async () => resolveRotation(links));
      window.confirm = originalConfirm;
    }
  });
});
