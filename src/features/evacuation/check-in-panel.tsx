"use client";

import { CheckCircle2, HeartHandshake, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useEvacuationCheckIns, getOwnCheckInForZone, recordCheckIn } from "@/lib/evacuation-checkins";
import { useSessionUserId } from "@/lib/auth/anonymous-session";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Let others know you're okay", fil: "Ipaalam na ikaw ay ligtas" };
const SUBTITLE: LocalizedText = {
  en: "Your barangay officials see this on WeatherWell. It is not an emergency line — in an emergency, call 911.",
  fil: "Makikita ito ng mga opisyal ng inyong barangay sa WeatherWell. Hindi ito emergency line — sa emergency, tumawag sa 911.",
};
const IM_SAFE: LocalizedText = { en: "I'm safe", fil: "Ligtas ako" };
const I_NEED_HELP: LocalizedText = { en: "I need help", fil: "Kailangan ko ng tulong" };
const CHECKED_IN_SAFE: LocalizedText = { en: "You checked in as safe.", fil: "Naka-check-in ka bilang ligtas." };
const CHECKED_IN_NEEDS_HELP: LocalizedText = {
  en: "You checked in as needing help — call the hotline if this is urgent.",
  fil: "Naka-check-in ka na kailangan ng tulong — tawagan ang hotline kung urgent ito.",
};

/**
 * Resident-facing "I'm safe" / "I need help" check-in, shown on the
 * evacuation page while the zone has an active Dangerous/Hazardous alert
 * (see the gating condition at the call site). PRD Gap D scope — see
 * src/lib/evacuation-checkins.ts for what this Phase 1 version does and
 * doesn't do.
 */
export function CheckInPanel({ zoneId }: { zoneId: string }) {
  const { lang } = useLanguage();
  const checkIns = useEvacuationCheckIns();
  const userId = useSessionUserId();
  const ownCheckIn = getOwnCheckInForZone(checkIns, zoneId, userId);

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
        {ownCheckIn && (
          <p lang={lang} className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-green-500" />
            {t(ownCheckIn.status === "safe" ? CHECKED_IN_SAFE : CHECKED_IN_NEEDS_HELP, lang)}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={ownCheckIn?.status === "safe" ? "default" : "outline"}
            onClick={() => recordCheckIn(zoneId, "safe")}
          >
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            {t(IM_SAFE, lang)}
          </Button>
          <Button
            type="button"
            variant={ownCheckIn?.status === "needs_help" ? "default" : "outline"}
            className={ownCheckIn?.status === "needs_help" ? undefined : "border-severity-red text-severity-red"}
            onClick={() => recordCheckIn(zoneId, "needs_help")}
          >
            <HeartHandshake aria-hidden="true" className="h-4 w-4" />
            {t(I_NEED_HELP, lang)}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
