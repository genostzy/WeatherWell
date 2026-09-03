"use client";

import { CheckCircle2, HeartHandshake, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useEvacuationCheckIns, getCheckInsForZone } from "@/lib/evacuation-checkins";
import { minutesSinceReport } from "@/lib/water-level-reports";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Resident check-ins", fil: "Check-in ng mga residente" };
const SUBTITLE: LocalizedText = {
  en: "Self-reported, unverified — Phase 1 demo, not a real accountability system yet",
  fil: "Sariling ulat, hindi pa na-verify — demo pa lang sa Phase 1",
};
const SAFE_COUNT: LocalizedText = { en: "checked in safe", fil: "naka-check-in bilang ligtas" };
const NEEDS_HELP_COUNT: LocalizedText = { en: "flagged needing help", fil: "na-flag na kailangan ng tulong" };
const NO_CHECK_INS: LocalizedText = { en: "No check-ins yet for this zone.", fil: "Wala pang check-in para sa zone na ito." };
const MIN_AGO: LocalizedText = { en: "min ago", fil: "minuto ang nakalipas" };

/** Admin-facing summary of the resident-facing check-in flow (PRD Gap D) — scoped to one zone, same pattern as RecentReportsPanel. */
export function CheckInSummaryPanel({ zoneId }: { zoneId: string }) {
  const { lang } = useLanguage();
  const allCheckIns = useEvacuationCheckIns();
  const checkIns = getCheckInsForZone(allCheckIns, zoneId);
  const safeCount = checkIns.filter((c) => c.status === "safe").length;
  const needsHelp = checkIns.filter((c) => c.status === "needs_help");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
        <p lang={lang} className="text-xs text-muted-foreground">
          {t(SUBTITLE, lang)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {checkIns.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(NO_CHECK_INS, lang)}</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-green-500" />
              <span className="font-semibold">{safeCount}</span> {t(SAFE_COUNT, lang)}
            </p>
            <p className="flex items-center gap-2 text-sm">
              <HeartHandshake aria-hidden="true" className="h-4 w-4 text-severity-red" />
              <span className="font-semibold">{needsHelp.length}</span> {t(NEEDS_HELP_COUNT, lang)}
            </p>
          </div>
        )}

        {needsHelp.length > 0 && (
          <ul className="space-y-1">
            {needsHelp.map((checkIn) => (
              <li
                key={checkIn.id}
                className="flex items-center justify-between rounded bg-severity-red/10 px-2 py-1 text-sm text-severity-red"
              >
                <span>{checkIn.deviceId.slice(0, 8)}</span>
                <span>
                  {minutesSinceReport(checkIn.checkedInAt)} {t(MIN_AGO, lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
