import { useEffect, useRef, useState } from "react";
import type { CalendarLinks } from "../types";

interface CalendarResourcesProps {
  links: CalendarLinks;
  onRotate: () => Promise<CalendarLinks>;
}

const ROTATION_CONFIRMATION =
  "Rigenerare il collegamento? Tutte le app calendario configurate con il collegamento attuale smetteranno di aggiornarsi.";

export async function confirmRotation(
  confirm: (message: string) => boolean,
  rotate: () => Promise<void>
): Promise<void> {
  if (confirm(ROTATION_CONFIRMATION)) await rotate();
}

export function CalendarResources({ links, onRotate }: CalendarResourcesProps) {
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
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
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
    <section aria-labelledby="calendar-resources-title" className="mb-8">
      <h2 id="calendar-resources-title" className="text-lg font-semibold text-gray-800 mb-3">
        Calendari
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">Calendario generale</h3>
          <p className="mt-1 text-sm text-gray-500">Tutti gli appuntamenti condivisi dalla scuola.</p>
          {links.generalGoogleUrl ? (
            <a
              href={links.generalGoogleUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              Collega calendario generale
            </a>
          ) : (
            <>
              <button
                type="button"
                disabled
                className="mt-4 rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-500"
              >
                Collega calendario generale
              </button>
              <p className="mt-2 text-sm text-gray-500">Calendario generale non configurato.</p>
            </>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">Il mio calendario</h3>
          <p className="mt-1 text-sm text-gray-500">Solo gli appuntamenti che ti riguardano.</p>
          <button
            type="button"
            ref={personalTriggerRef}
            onClick={openPersonalDialog}
            disabled={!personalAvailable}
            className="mt-4 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-500"
          >
            Collega il mio calendario
          </button>
          {!personalAvailable && (
            <p className="mt-2 text-sm text-gray-500">Il tuo calendario personale non è disponibile.</p>
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
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={trapDialogFocus}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="personal-calendar-title" className="text-lg font-semibold text-gray-900">
                  Collega il mio calendario
                </h2>
                <p className="mt-1 text-sm text-gray-500">Questo collegamento resta aggiornato con gli eventi di Intercomunica.</p>
              </div>
              <button
                type="button"
                ref={closeButtonRef}
                onClick={closePersonalDialog}
                aria-label="Chiudi"
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <a
                href={links.personalWebcalUrl!}
                className="inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
              >
                Apri nell'app Calendario
              </a>
              <div>
                <button
                  type="button"
                  onClick={copyHttpsUrl}
                  className="rounded-md border border-blue-700 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
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
                <p className="mt-1"><strong className="text-gray-800">Apple Calendar:</strong> usa “Apri nell'app Calendario” oppure aggiungi un nuovo calendario in abbonamento.</p>
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
                  className="rounded-md border border-red-700 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
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
  );
}
