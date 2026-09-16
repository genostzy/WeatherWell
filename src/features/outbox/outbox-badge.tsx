"use client";

import { useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { OverlayDialog } from "@/components/overlay-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useOutbox, retryEntry, discardEntry } from "@/lib/outbox/outbox";
import { knownSessionUserId } from "@/lib/auth/session-user";
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
 */
function isCountedForThisSession(entry: OutboxEntry): boolean {
  if (entry.status === "held") return false;
  const userId = knownSessionUserId();
  return entry.userId === userId || entry.userId === null;
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
 * Hidden entirely at zero — see `badgeState`.
 */
export function OutboxBadge() {
  const { lang } = useLanguage();
  const outbox = useOutbox();
  const zones = useContext(ReferenceDataContext)?.zones ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discarding, setDiscarding] = useState<string | null>(null);

  const counted = outbox.filter(isCountedForThisSession);
  const summary = badgeState(counted);

  if (!summary) return null;

  const label = badgeLabel(summary.state, summary.count, lang);
  const discardingEntry = discarding ? counted.find((entry) => entry.id === discarding) : undefined;

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
                {entry.status === "stuck" && (
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="lg" variant="outline" onClick={() => retryEntry(entry.id)}>
                      {t(RETRY_LABEL, lang)}
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      onClick={() => setDiscarding(entry.id)}
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

      {discardingEntry && (
        <ConfirmDialog
          title={t(DISCARD_LABEL, lang)}
          body={t(DISCARD_CONFIRM, lang)}
          confirmLabel={t(DISCARD_LABEL, lang)}
          cancelLabel={t(CANCEL, lang)}
          closeLabel={t(CLOSE, lang)}
          onConfirm={() => {
            discardEntry(discardingEntry.id);
            setDiscarding(null);
          }}
          onCancel={() => setDiscarding(null)}
        />
      )}
    </>
  );
}
