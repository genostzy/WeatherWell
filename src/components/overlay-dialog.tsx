"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A centered modal layer. Used instead of an inline block for anything a
 * resident opens mid-task on the homepage map — a form or a photo shown
 * below the map would sit off-screen behind a 600px-tall map, forcing a
 * scroll away from what they just tapped.
 *
 * Sits above the map's own z-[1000] overlays (legend, hazard selector).
 * shadcn's Dialog isn't installed in this project, and this needs only a
 * backdrop, Escape, and a close button — not a full focus-trapping primitive.
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
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    // The page behind must not scroll while the overlay is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
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
