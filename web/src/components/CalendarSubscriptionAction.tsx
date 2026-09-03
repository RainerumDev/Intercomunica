import { createContext, useContext, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useDialogFocus } from "./useDialogFocus";

type ClipboardStatus = "copied" | "unavailable";

interface ManualFallback {
  copyStatus: ClipboardStatus;
  httpsUrl: string;
}

interface SubscriptionController {
  activate: (httpsUrl: string) => Promise<ManualFallback | null>;
}

function canonicalHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Calendar feeds must use HTTPS");
  return url.href;
}

export function googleCalendarSubscribeUrl(httpsUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(canonicalHttpsUrl(httpsUrl))}`;
}

export function webcalUrl(httpsUrl: string): string {
  return canonicalHttpsUrl(httpsUrl).replace(/^https:/u, "webcal:");
}

function createSubscriptionController(): SubscriptionController {
  const attemptedFeeds = new Set<string>();

  return {
    async activate(httpsUrl) {
      const canonicalUrl = canonicalHttpsUrl(httpsUrl);
      if (!attemptedFeeds.has(canonicalUrl)) {
        window.open(googleCalendarSubscribeUrl(canonicalUrl), "_blank", "noopener,noreferrer");
        attemptedFeeds.add(canonicalUrl);
        return null;
      }

      try {
        const clipboard = navigator.clipboard;
        if (!clipboard) return { copyStatus: "unavailable", httpsUrl: canonicalUrl };
        await clipboard.writeText(canonicalUrl);
        return { copyStatus: "copied", httpsUrl: canonicalUrl };
      } catch {
        return { copyStatus: "unavailable", httpsUrl: canonicalUrl };
      }
    },
  };
}

const CalendarSubscriptionContext = createContext<SubscriptionController | null>(null);

export function CalendarSubscriptionScope({ children }: { children: ReactNode }) {
  const [controller] = useState(createSubscriptionController);
  return <CalendarSubscriptionContext.Provider value={controller}>{children}</CalendarSubscriptionContext.Provider>;
}

interface CalendarSubscriptionActionProps {
  className?: string;
  httpsUrl: string;
}

export function CalendarSubscriptionAction({ className, httpsUrl }: CalendarSubscriptionActionProps) {
  const sharedController = useContext(CalendarSubscriptionContext);
  const [standaloneController] = useState(createSubscriptionController);
  const controller = sharedController ?? standaloneController;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const feedUrlRef = useRef<HTMLInputElement>(null);
  const [manualFallback, setManualFallback] = useState<ManualFallback | null>(null);
  const close = () => setManualFallback(null);
  const dialogRef = useDialogFocus({ active: manualFallback !== null, onClose: close });

  useLayoutEffect(() => {
    if (manualFallback) feedUrlRef.current?.focus();
  }, [manualFallback]);

  async function activate() {
    triggerRef.current?.focus();
    try {
      const fallback = await controller.activate(httpsUrl);
      if (fallback) setManualFallback(fallback);
    } catch {
      return;
    }
  }

  function stopOuterDialogFromClosing(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-label="Aggiungi il calendario a Google Calendar"
        className={className}
        onClick={() => void activate()}
      >
        Aggiungi a Google Calendar
      </button>
      {manualFallback && (
        <div className="calendar-subscription-dialog" role="presentation">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Chiudi istruzioni calendario"
            className="calendar-subscription-dialog__backdrop"
            onClick={close}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-subscription-title"
            className="calendar-subscription-dialog__panel"
            onKeyDown={stopOuterDialogFromClosing}
            tabIndex={-1}
          >
            <button type="button" aria-label="Chiudi" className="calendar-subscription-dialog__close" onClick={close}>
              ×
            </button>
            <h2 id="calendar-subscription-title">Aggiungi il calendario</h2>
            <p>In Google Calendar scegli <strong>Altri calendari → + → Da URL</strong>.</p>
            <a href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noopener noreferrer">
              Apri le impostazioni di Google Calendar
            </a>
            <label htmlFor="calendar-subscription-url">URL del calendario</label>
            <input
              id="calendar-subscription-url"
              aria-label="URL del calendario"
              ref={feedUrlRef}
              value={manualFallback.httpsUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
            <p role="status" aria-live="polite" className="calendar-subscription-dialog__status">
              {manualFallback.copyStatus === "copied"
                ? "Indirizzo copiato negli appunti."
                : "Non è stato possibile copiare l'indirizzo. Selezionalo e copialo manualmente."}
            </p>
            <a className="calendar-subscription-dialog__webcal" href={webcalUrl(manualFallback.httpsUrl)}>
              Prova con un'altra app calendario
            </a>
          </div>
        </div>
      )}
    </>
  );
}
