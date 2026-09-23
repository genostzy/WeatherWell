"use client";

import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useHasHydrated } from "@/lib/use-hydrated";
import { minutesSinceReport } from "@/lib/water-level-reports";
import type { LocalizedText } from "@/lib/types";

const STALE_AFTER_HOURS = 12;
const PREFIX: LocalizedText = { en: "PAGASA bulletin,", fil: "PAGASA bulletin," };
const GDACS_PREFIX: LocalizedText = { en: "GDACS backup reading,", fil: "Reserbang ulat ng GDACS," };
const HOURS_OLD: LocalizedText = { en: "h old", fil: "oras na ang nakalipas" };
const STALE: LocalizedText = {
  en: "May be out of date — check PAGASA or the radio.",
  fil: "Maaaring luma na — tingnan ang PAGASA o makinig sa radyo.",
};

/**
 * The typhoon data refreshes once a day (Vercel's free cron), so a storm
 * reading can be most of a day old. Say so rather than let it pass as live.
 * Client-only, like TimeAgo: the age depends on the browser's clock.
 */
export function BulletinAge({ issuedAt, source }: { issuedAt: string | null; source?: string }) {
  const { lang } = useLanguage();
  const hasHydrated = useHasHydrated();
  if (!issuedAt || !hasHydrated) return null;

  const hours = Math.max(0, Math.floor(minutesSinceReport(issuedAt) / 60));
  return (
    <p lang={lang} className="text-xs text-muted-foreground">
      {t(source === "GDACS" ? GDACS_PREFIX : PREFIX, lang)} {hours} {t(HOURS_OLD, lang)}
      {hours >= STALE_AFTER_HOURS && <span className="block font-medium text-severity-orange">{t(STALE, lang)}</span>}
    </p>
  );
}
