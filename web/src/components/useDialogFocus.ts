import { useLayoutEffect, useRef } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface Options {
  active?: boolean;
  closeDisabled?: boolean;
  onClose: () => void;
}

export function useDialogFocus({ active = true, closeDisabled = false, onClose }: Options) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  closeRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useLayoutEffect(() => {
    if (!active) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);

    (focusableElements()[0] ?? dialogRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!closeDisabledRef.current) {
          event.preventDefault();
          closeRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !dialogRef.current?.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [active]);

  return dialogRef;
}
