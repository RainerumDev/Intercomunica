// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarResources, confirmRotation } from "./CalendarResources";
import {
  CalendarSubscriptionAction,
  CalendarSubscriptionScope,
  googleCalendarSubscribeUrl,
  webcalUrl,
} from "./CalendarSubscriptionAction";
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

describe("calendar subscription URLs", () => {
  const tokenizedFeed = "https://intercomunica.example/calendar/feed/mario-secret.ics?token=segreto&view=personale";

  it("encodes the canonical HTTPS feed for Google and creates its webcal fallback", () => {
    expect(googleCalendarSubscribeUrl(tokenizedFeed)).toBe(
      "https://calendar.google.com/calendar/r?cid=https%3A%2F%2Fintercomunica.example%2Fcalendar%2Ffeed%2Fmario-secret.ics%3Ftoken%3Dsegreto%26view%3Dpersonale"
    );
    expect(webcalUrl(tokenizedFeed)).toBe(
      "webcal://intercomunica.example/calendar/feed/mario-secret.ics?token=segreto&view=personale"
    );
  });
});

describe("calendar subscription action", () => {
  const alphaFeed = "https://intercomunica.example/calendar/feed/mario-secret.ics?token=alpha&view=personale";
  const betaFeed = "https://intercomunica.example/calendar/feed/anna-secret.ics?token=beta";
  const actionName = "Aggiungi il calendario a Google Calendar";

  function renderActions() {
    return root.render(
      <CalendarSubscriptionScope>
        <CalendarSubscriptionAction httpsUrl={alphaFeed} />
        <CalendarSubscriptionAction httpsUrl={betaFeed} />
      </CalendarSubscriptionScope>
    );
  }

  function subscriptionButtons(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll("button")).filter(
      (button) => button.getAttribute("aria-label") === actionName
    ) as HTMLButtonElement[];
  }

  it("opens the encoded Google URL only on the first activation for each feed", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    try {
      await act(async () => renderActions());
      const [alpha, beta] = subscriptionButtons();

      await act(async () => alpha.click());
      await act(async () => beta.click());

      expect(open).toHaveBeenCalledWith(
        "https://calendar.google.com/calendar/r?cid=https%3A%2F%2Fintercomunica.example%2Fcalendar%2Ffeed%2Fmario-secret.ics%3Ftoken%3Dalpha%26view%3Dpersonale",
        "_blank",
        "noopener,noreferrer"
      );
      expect(open).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      open.mockRestore();
    }
  });

  it("retries Google without an unhandled activation when the first navigation throws", async () => {
    const open = vi.spyOn(window, "open")
      .mockImplementationOnce(() => { throw new Error("navigation blocked"); })
      .mockImplementation(() => null);
    try {
      await act(async () => renderActions());
      const [alpha] = subscriptionButtons();

      await act(async () => alpha.click());
      await act(async () => alpha.click());

      expect(open).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      open.mockRestore();
    }
  });

  it("copies the HTTPS feed and presents an accessible manual fallback after the second activation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.spyOn(window, "open").mockImplementation(() => null);
    try {
      await act(async () => renderActions());
      const [alpha] = subscriptionButtons();

      await act(async () => alpha.click());
      await act(async () => alpha.click());

      const dialog = container.querySelector('[role="dialog"]');
      const input = container.querySelector('input[aria-label="URL del calendario"]');
      const manualGoogle = Array.from(container.querySelectorAll("a")).find(
        (link) => link.textContent === "Apri le impostazioni di Google Calendar"
      );
      const webcal = Array.from(container.querySelectorAll("a")).find(
        (link) => link.textContent === "Prova con un'altra app calendario"
      );

      expect(writeText).toHaveBeenCalledWith(alphaFeed);
      expect(dialog?.getAttribute("aria-modal")).toBe("true");
      expect(input).toHaveProperty("value", alphaFeed);
      expect(document.activeElement).toBe(input);
      expect(manualGoogle?.getAttribute("href")).toBe("https://calendar.google.com/calendar/u/0/r/settings/addbyurl");
      expect(manualGoogle?.getAttribute("rel")).toBe("noopener noreferrer");
      expect(webcal?.getAttribute("href")).toBe("webcal://intercomunica.example/calendar/feed/mario-secret.ics?token=alpha&view=personale");
      expect(container.querySelector('[role="status"]')?.textContent).toContain("Indirizzo copiato");

      const close = dialog?.querySelector('button[aria-label="Chiudi"]');
      if (!(close instanceof HTMLButtonElement) || !(webcal instanceof HTMLAnchorElement)) {
        throw new Error("Manual fallback controls not found");
      }
      webcal.focus();
      await act(async () => {
        webcal.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      });
      expect(document.activeElement).toBe(close);
      await act(async () => {
        close.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
      });
      expect(document.activeElement).toBe(webcal);

      await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(alpha);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("keeps the selectable manual fallback available when clipboard access is rejected", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    vi.spyOn(window, "open").mockImplementation(() => null);
    try {
      await act(async () => renderActions());
      const [alpha] = subscriptionButtons();

      await act(async () => alpha.click());
      await act(async () => alpha.click());

      expect(container.querySelector('input[aria-label="URL del calendario"]')).toHaveProperty("value", alphaFeed);
      expect(container.querySelector('[role="status"]')?.textContent).toContain("Non è stato possibile copiare");
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("CalendarResources personal dialog", () => {
  it("offers Google subscription before the secondary calendar-app fallback", async () => {
    await act(async () => {
      root.render(<CalendarResources links={links} onRotate={async () => links} />);
    });

    await act(async () => buttonByText("Collega il mio calendario").click());

    const dialog = container.querySelector('[role="dialog"]');
    const googleAction = dialog?.querySelector('button[aria-label="Aggiungi il calendario a Google Calendar"]');
    const appFallback = Array.from(dialog?.querySelectorAll("a") ?? []).find(
      (link) => link.textContent === "Prova con un'altra app calendario"
    );

    expect(googleAction).toBeInstanceOf(HTMLButtonElement);
    expect(appFallback?.getAttribute("href")).toBe(links.personalWebcalUrl);
    expect(dialog?.textContent).toContain(
      "Apple Calendar: usa “Prova con un'altra app calendario” oppure aggiungi un nuovo calendario in abbonamento."
    );
  });

  it("closes only the Google fallback dialog on Escape and returns focus to its action", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    try {
      await act(async () => {
        root.render(<CalendarResources links={links} onRotate={async () => links} />);
      });
      await act(async () => buttonByText("Collega il mio calendario").click());
      const googleAction = container.querySelector('button[aria-label="Aggiungi il calendario a Google Calendar"]');
      if (!(googleAction instanceof HTMLButtonElement)) throw new Error("Google action not found");

      await act(async () => googleAction.click());
      await act(async () => googleAction.click());

      const input = container.querySelector('input[aria-label="URL del calendario"]');
      if (!(input instanceof HTMLInputElement)) throw new Error("Calendar URL input not found");
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });

      expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
      expect(document.activeElement).toBe(googleAction);
    } finally {
      open.mockRestore();
    }
  });

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
