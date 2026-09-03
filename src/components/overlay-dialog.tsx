"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A centered modal layer. Used instead of an inline block for anything a
 * resident opens mid-task on the homepage map — a form or a photo shown
 * below the map would sit off-screen behind a 600px-tall map, forcing a
 * scroll away from what they just tapped.
 *
 * Sits above the map's own z-[1000] overlays (legend, hazard selector).
 * Includes a focus trap so Tab key stays inside the dialog — critical for
 * a crisis app where a user could otherwise Tab out and lose context.
 */
export function OverlayDialog({
  onClose,
  label,
  closeLabel,
  children,
  className = "max-w-md",
}: {
  onClose: () => void;
  label: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Remember what had focus before the dialog opened, so we can restore it on close.
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element inside the dialog.
    const dialog = dialogRef.current;
    if (dialog) {
      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      firstFocusable?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      // Trap Tab inside the dialog.
      if (event.key === "Tab" && dialog) {
        const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    // The page behind must not scroll while the overlay is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      // Restore focus to the element that had it before the dialog opened.
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`relative max-h-[90vh] w-full overflow-y-auto ${className}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-md border-2 border-border bg-background text-foreground"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
