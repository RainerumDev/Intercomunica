import { useEffect, useRef, useState } from "react";
import type { CalendarLinks } from "../types";
import { CalendarSubscriptionAction, CalendarSubscriptionScope } from "./CalendarSubscriptionAction";

interface CalendarResourcesProps {
  links: CalendarLinks;
  onRotate: () => Promise<CalendarLinks>;
  statusMessage?: string;
}

const ROTATION_CONFIRMATION =
  "Rigenerare il collegamento? Tutte le app calendario configurate con il collegamento attuale smetteranno di aggiornarsi.";

export async function confirmRotation(
  confirm: (message: string) => boolean,
  rotate: () => Promise<void>
): Promise<void> {
  if (confirm(ROTATION_CONFIRMATION)) await rotate();
}

export function CalendarResources({ links, onRotate, statusMessage }: CalendarResourcesProps) {
  const [personalDialogOpen, setPersonalDialogOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const personalTriggerRef = useRef<HTMLButtonElement>(null);
  const personalDialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closePersonalDialog = () => {
    setPersonalDialogOpen(false);
    personalTriggerRef.current?.focus();
  };

  useEffect(() => {
    if (!personalDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePersonalDialog();
    };
    document.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [personalDialogOpen]);

  const openPersonalDialog = () => {
    setCopyMessage(null);
    setRotationError(null);
    setPersonalDialogOpen(true);
  };

  const trapDialogFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const dialog = personalDialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement as HTMLElement | null;
    if (!activeElement || !focusable.includes(activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const copyHttpsUrl = async () => {
    if (!links.personalIcsUrl) return;
    try {
      await navigator.clipboard.writeText(links.personalIcsUrl);
      setCopyMessage("Indirizzo copiato.");
    } catch {
      setCopyMessage("Non è stato possibile copiare l'indirizzo. Selezionalo e copialo manualmente.");
    }
  };

  const rotateLink = async () => {
    setRotationError(null);
    await confirmRotation(window.confirm, async () => {
      setRotating(true);
      try {
        await onRotate();
        setCopyMessage("Nuovo collegamento generato. Aggiorna le app calendario con il nuovo indirizzo.");
      } catch (error) {
        setRotationError((error as Error).message);
      } finally {
        setRotating(false);
      }
    });
  };

  const personalAvailable = Boolean(
    links.personalFeedEligible && links.personalIcsUrl && links.personalWebcalUrl
  );

  return (
    <CalendarSubscriptionScope>
      <section aria-labelledby="calendar-resources-title" className="section-block">
      <h2 id="calendar-resources-title" className="section-heading">
        Calendari
      </h2>
      {statusMessage && (
        <p role="status" className="portal-status">
          {statusMessage}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface-card surface-card--padded">
          <h3 className="section-heading">Calendario generale</h3>
          <p className="field-hint mt-1">Tutti gli appuntamenti condivisi dalla scuola.</p>
          {links.generalGoogleUrl ? (
            <a
              href={links.generalGoogleUrl}
              target="_blank"
              rel="noreferrer"
              className="button button--primary mt-4"
            >
              Collega calendario generale
            </a>
          ) : (
            <>
              <button
                type="button"
                disabled
                className="button button--primary mt-4"
              >
                Collega calendario generale
              </button>
              <p className="field-hint mt-2">Calendario generale non configurato.</p>
            </>
          )}
        </div>

        <div className="surface-card surface-card--padded">
          <h3 className="section-heading">Il mio calendario</h3>
          <p className="field-hint mt-1">Solo gli appuntamenti che ti riguardano.</p>
          <button
            type="button"
            ref={personalTriggerRef}
            onClick={openPersonalDialog}
            disabled={!personalAvailable}
            className="button button--primary mt-4"
          >
            Collega il mio calendario
          </button>
          {!personalAvailable && (
            <p className="field-hint mt-2">Il tuo calendario personale non è disponibile.</p>
          )}
        </div>
      </div>

      {personalDialogOpen && personalAvailable && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={closePersonalDialog}
        >
          <div
            ref={personalDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="personal-calendar-title"
            className="dialog-panel"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={trapDialogFocus}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="personal-calendar-title" className="section-heading">
                  Collega il mio calendario
                </h2>
                <p className="field-hint mt-1">Questo collegamento resta aggiornato con gli eventi di Intercomunica.</p>
              </div>
              <button
                type="button"
                ref={closeButtonRef}
                onClick={closePersonalDialog}
                aria-label="Chiudi"
                className="text-action text-xl"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <CalendarSubscriptionAction
                className="button button--primary"
                httpsUrl={links.personalIcsUrl!}
              />
              <a
                href={links.personalWebcalUrl!}
                className="button button--secondary"
              >
                Prova con un'altra app calendario
              </a>
              <div>
                <button
                  type="button"
                  onClick={copyHttpsUrl}
                  className="button button--secondary"
                >
                  Copia indirizzo HTTPS
                </button>
                <p className="mt-2 select-all break-all rounded bg-gray-50 p-2 font-mono text-xs text-gray-700">
                  {links.personalIcsUrl}
                </p>
                {copyMessage && <p className="mt-2 text-sm text-green-700">{copyMessage}</p>}
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                <p><strong className="text-gray-800">Google Calendar:</strong> aggiungi un calendario “Da URL” e incolla l'indirizzo HTTPS.</p>
                <p className="mt-1"><strong className="text-gray-800">Apple Calendar:</strong> usa “Prova con un'altra app calendario” oppure aggiungi un nuovo calendario in abbonamento.</p>
                <p className="mt-1"><strong className="text-gray-800">Outlook:</strong> aggiungi un calendario da Internet e incolla l'indirizzo HTTPS.</p>
              </div>
              <p className="text-sm text-gray-500">
                {links.lastFetchedAt
                  ? `Ultimo aggiornamento richiesto: ${new Date(links.lastFetchedAt).toLocaleString("it-IT")}.`
                  : "Il calendario non è stato ancora aggiornato da un'app calendario."}
              </p>
              <div className="border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={rotateLink}
                  disabled={rotating}
                  className="button button--danger"
                >
                  {rotating ? "Rigenerazione…" : "Rigenera collegamento"}
                </button>
                <p className="mt-2 text-sm text-gray-500">Le app configurate con il collegamento attuale smetteranno di aggiornarsi.</p>
                {rotationError && <p className="mt-2 text-sm text-red-700">{rotationError}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
      </section>
    </CalendarSubscriptionScope>
  );
}
