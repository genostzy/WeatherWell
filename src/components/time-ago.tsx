"use client";

import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useHasHydrated } from "@/lib/use-hydrated";
import { minutesSinceReport } from "@/lib/water-level-reports";
import type { LocalizedText } from "@/lib/types";

const MINUTES_AGO: LocalizedText = { en: "min ago", fil: "min ang nakaraan" };

/**
 * How long ago a report came in — "8 min ago" — rendered only in the browser.
 *
 * Elapsed time is measured against whatever "now" is at the instant of render,
 * and the server's instant is never the browser's. The server renders, the
 * HTML travels, and the browser hydrates some unknown time later; whenever
 * those two instants round to different minutes the text disagrees and React
 * reports a hydration mismatch.
 *
 * Seeded mock data made this worse in Phase 1 — the seeds are anchored to
 * whenever their module was first imported, which differs between the
 * long-lived server process and a freshly loaded page — but fixing the seeds
 * would not fix the general case. Real timestamps from a database in Phase 2
 * straddle a minute boundary just as easily. The durable answer is to keep
 * clock-derived text out of the server's markup entirely.
 *
 * Everything else about a report — its depth, whether it is an outlier — is
 * deterministic and still server-rendered, so only the age arrives a beat late.
 */
export function TimeAgo({
  reportedAt,
  prefix,
  className,
}: {
  reportedAt: string;
  /** Rendered immediately before the time, and suppressed alongside it. */
  prefix?: string;
  className?: string;
}) {
  const { lang } = useLanguage();
  const hasHydrated = useHasHydrated();

  if (!hasHydrated) return null;

  return (
    <span className={className}>
      {prefix}
      {minutesSinceReport(reportedAt)} {t(MINUTES_AGO, lang)}
    </span>
  );
}
