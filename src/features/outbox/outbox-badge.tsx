"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { OverlayDialog } from "@/components/overlay-dialog";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useOutbox, retryEntry, discardEntry } from "@/lib/outbox/outbox";
import { drainForCurrentSession } from "@/lib/outbox/session-drain";
import { useSessionUserId } from "@/lib/auth/anonymous-session";
import { ReferenceDataContext } from "@/lib/reference-data/provider";
import { formatActionTime } from "@/lib/official-actions-copy";
import type { OutboxEntry } from "@/lib/outbox/types";
import {
  badgeLabel,
  entryDescription,
  entryStatusText,
  RETRY_LABEL,
  DISCARD_LABEL,
  DISCARD_CONFIRM,
  CLOSE,
  CANCEL,
  type OutboxBadgeState,
} from "./outbox-copy";

/**
 * Which of `entry` is this device's business right now (design doc, spec
 * section 3: "counts only entries whose userId is the current session user,
 * or null on this device"). A held entry is never counted, no matter whose
 * it is — it is waiting on its owner signing back in, not on a send.
 *
 * `currentUserId` must be the REACTIVE session id (`useSessionUserId()`),
 * not `knownSessionUserId()`'s one-shot snapshot — fix round 1, finding 1.
 * On a shared phone, a sign-out or a different Google account changes who
 * `auth.uid()` is without a reload, and this component must stop showing
 * the previous person's entries the instant that happens, not just on the
 * next drain or page load.
 */
function isCountedForThisSession(entry: OutboxEntry, currentUserId: string | null): boolean {
  if (entry.status === "held") return false;
  return entry.userId === currentUserId || entry.userId === null;
}

/**
 * The badge's one-line state: which count to show, and whether it is the
 * amber "couldn't send" state. Spec section 3's table has exactly two rows —
 * "pending" and "any stuck" — so a mix of both is shown as "stuck" (the
 * count of stuck entries), the state that needs the resident's attention.
 * Pending entries in that same mix are still listed in the dialog; they are
 * just not what the one-line badge counts while anything is stuck.
 */
function badgeState(entries: OutboxEntry[]): { state: OutboxBadgeState; count: number } | null {
  const stuckCount = entries.filter((entry) => entry.status === "stuck").length;
  if (stuckCount > 0) return { state: "stuck", count: stuckCount };
  const pendingCount = entries.filter((entry) => entry.status === "pending").length;
  if (pendingCount > 0) return { state: "pending", count: pendingCount };
  return null;
}

function discardButtonId(entryId: string): string {
  return `outbox-discard-${entryId}`;
}

function confirmButtonId(entryId: string): string {
  return `outbox-discard-confirm-${entryId}`;
}

/**
 * Sits beside `LanguageToggle` in the root header (mounted in
 * src/app/layout.tsx as `ReferenceDataProvider`'s `chrome`), on every screen
 * including /admin. Shows how many of the CURRENT user's queued writes are
 * still waiting to send or couldn't be sent; tapping it lists them, with
 * Retry and Discard for stuck ones.
 *
 * Reads `ReferenceDataContext` directly rather than through `useZones()`:
 * the header (this component's home) sits in `chrome`, which — unlike
 * `children` — is rendered even before reference data has loaded, so the
 * context can genuinely be `null` here. `useZones()` would throw in that
 * window; an empty zone list just means `entryDescription` falls back to
 * showing the raw zone id until the real data arrives.
 *
 * Discard's confirmation is INLINE in the same list dialog (fix round 1,
 * finding 3) rather than a second stacked `OverlayDialog` — two nested
 * modals meant two focus traps and two controls both named "Discard". Only
 * one `role="dialog"` ever exists here.
 *
 * Hidden entirely at zero — see `badgeState`.
 */
export function OutboxBadge() {
  const { lang } = useLanguage();
  const outbox = useOutbox();
  const currentUserId = useSessionUserId();
  const zones = useContext(ReferenceDataContext)?.zones ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  // Which entry's Discard button gets focus back after Cancel — see the
  // effect below. Not state: changing it must never itself trigger a render.
  const returnFocusIdRef = useRef<string | null>(null);

  // Moves focus to the inline Confirm button the moment its row appears, and
  // back to that row's own Discard button the moment Cancel closes it — the
  // same "trap focus inside what just took over the screen, restore it on
  // the way out" contract OverlayDialog already gives the dialog itself.
  useEffect(() => {
    if (discardingId) {
      document.getElementById(confirmButtonId(discardingId))?.focus();
      return;
    }
    const returnTo = returnFocusIdRef.current;
    if (returnTo) {
      returnFocusIdRef.current = null;
      document.getElementById(discardButtonId(returnTo))?.focus();
    }
  }, [discardingId]);

  const counted = outbox.filter((entry) => isCountedForThisSession(entry, currentUserId));
  const summary = badgeState(counted);
  const showing = summary !== null;

  // The component stays mounted while it renders nothing, so its state
  // survives an empty list. Once the list empties (everything delivered or
  // discarded), the dialog closes for good: the next write must bring back
  // the badge alone, not a modal trapping focus over the screen the
  // resident is using. Adjusted during render, React's pattern for state
  // that follows a change in what is being rendered, so no render ever
  // shows the stale open dialog.
  const [wasShowing, setWasShowing] = useState(showing);
  if (wasShowing !== showing) {
    setWasShowing(showing);
    if (!showing) {
      setDialogOpen(false);
      setDiscardingId(null);
    }
  }

  if (!summary) return null;

  const label = badgeLabel(summary.state, summary.count, lang);

  function beginDiscard(entryId: string) {
    returnFocusIdRef.current = entryId;
    setDiscardingId(entryId);
  }

  function cancelDiscard() {
    setDiscardingId(null);
  }

  /**
   * Retry has to SEND, not just relabel the entry: `retryEntry` makes it due
   * and wakes the service worker, and this starts the page's own drain, the
   * same send-now every store starts after a write. The drain lives here
   * rather than inside `retryEntry` because session-drain.ts imports the
   * store module; calling it from the store would make the two import each
   * other.
   */
  function retry(entryId: string) {
    retryEntry(entryId);
    drainForCurrentSession();
  }

  function confirmDiscard(entryId: string) {
    discardEntry(entryId);
    // The row (and its Discard button) is gone — nothing to return focus to.
    returnFocusIdRef.current = null;
    setDiscardingId(null);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        data-state={summary.state}
        className={
          summary.state === "stuck"
            ? "border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-400"
            : undefined
        }
        onClick={() => setDialogOpen(true)}
      >
        <span aria-live="polite">{label}</span>
      </Button>

      {dialogOpen && (
        <OverlayDialog onClose={() => setDialogOpen(false)} label={label} closeLabel={t(CLOSE, lang)}>
          <ul className="space-y-3 rounded-lg border-2 border-border bg-background p-4">
            {counted.map((entry) => (
              <li key={entry.id} className="space-y-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
                <p className="font-medium">{entryDescription(entry, zones, lang)}</p>
                <p className="text-sm text-muted-foreground">{formatActionTime(entry.queuedAt, lang)}</p>
                <p className="text-sm">{entryStatusText(entry, lang)}</p>
                {entry.status === "stuck" && discardingId === entry.id && (
                  <div className="space-y-2 pt-1">
                    <p className="text-sm font-medium">{t(DISCARD_CONFIRM, lang)}</p>
                    <div className="flex gap-2">
                      <Button
                        id={confirmButtonId(entry.id)}
                        type="button"
                        size="lg"
                        variant="outline"
                        onClick={() => confirmDiscard(entry.id)}
                      >
                        {t(DISCARD_LABEL, lang)}
                      </Button>
                      <Button type="button" size="lg" variant="outline" onClick={cancelDiscard}>
                        {t(CANCEL, lang)}
                      </Button>
                    </div>
                  </div>
                )}
                {entry.status === "stuck" && discardingId !== entry.id && (
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="lg" variant="outline" onClick={() => retry(entry.id)}>
                      {t(RETRY_LABEL, lang)}
                    </Button>
                    <Button
                      id={discardButtonId(entry.id)}
                      type="button"
                      size="lg"
                      variant="outline"
                      onClick={() => beginDiscard(entry.id)}
                    >
                      {t(DISCARD_LABEL, lang)}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </OverlayDialog>
      )}
    </>
  );
}
