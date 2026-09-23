"use client";

import { useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "./severity-badge";
import { ShareAlertButton } from "./share-alert-button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useHasHydrated } from "@/lib/use-hydrated";
import { minutesSinceReport } from "@/lib/water-level-reports";
import type { AlertRecord, LocalizedText, Zone } from "@/lib/types";

const NO_ACTIVE_ALERT: LocalizedText = {
  en: "No active alert for this zone.",
  fil: "Walang aktibong alerto para sa zone na ito.",
};

const UNVERIFIED: LocalizedText = {
  en: "Unverified — based on residents' reports, not yet confirmed by an official.",
  fil: "Hindi pa kumpirmado — batay sa ulat ng mga residente, hindi pa napapatunayan ng opisyal.",
};

const READ_ALOUD: LocalizedText = { en: "Read aloud", fil: "Basahin nang malakas" };
const ISSUED: LocalizedText = { en: "Issued", fil: "Inilabas" };
const HOURS_AGO: LocalizedText = { en: "h ago", fil: "oras na ang nakalipas" };
const MAYBE_STALE: LocalizedText = {
  en: "Over a day old — may no longer be current. Check with your barangay.",
  fil: "Mahigit isang araw na — maaaring hindi na napapanahon. Magtanong sa inyong barangay.",
};
const STALE_AFTER_HOURS = 24;

/**
 * An official's alert stays active until someone lowers it (idea 13), so a
 * forgotten one can look current for days. Show its age, and say so once it
 * is over a day old. Client-only, like TimeAgo: the age reads the clock.
 */
function AlertAge({ issuedAt, lang }: { issuedAt: string; lang: "en" | "fil" }) {
  const hasHydrated = useHasHydrated();
  if (!hasHydrated) return null;
  const hours = Math.floor(minutesSinceReport(issuedAt) / 60);
  return (
    <p lang={lang} className="text-xs text-muted-foreground">
      {t(ISSUED, lang)} {hours} {t(HOURS_AGO, lang)}
      {hours >= STALE_AFTER_HOURS && <span className="block font-medium text-severity-orange">{t(MAYBE_STALE, lang)}</span>}
    </p>
  );
}

const noSubscribe = () => () => {};

/** The browser's own speech (free, on-device, works offline) for residents who find reading hard. */
function ReadAloudButton({ text, lang }: { text: string; lang: "en" | "fil" }) {
  const canSpeak = useSyncExternalStore(noSubscribe, () => typeof window !== "undefined" && !!window.speechSynthesis, () => false);
  if (!canSpeak) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === "fil" ? "fil-PH" : "en-PH";
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }}
    >
      <Volume2 aria-hidden="true" className="h-4 w-4" />
      <span lang={lang}>{t(READ_ALOUD, lang)}</span>
    </Button>
  );
}

const CONFIDENCE_LABEL = {
  en: { estimated: "Estimated", validated: "Validated", calibrated: "Calibrated" },
  fil: { estimated: "Tantiya", validated: "Napatunayan", calibrated: "Na-calibrate" },
};

export function AlertCard({
  alert,
  zone,
}: {
  alert: AlertRecord | undefined;
  zone: Zone;
}) {
  const { lang } = useLanguage();

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{zone.name}</CardTitle>
        {alert && <SeverityBadge severity={alert.severity} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {alert ? (
          <>
            <p lang={lang} className="text-base">
              {t(alert.message, lang)}
            </p>
            {alert.predictedTiming && (
              <p lang={lang} className="text-sm text-muted-foreground">
                ⏱ {t(alert.predictedTiming, lang)}
              </p>
            )}
            <AlertAge issuedAt={alert.issuedAt} lang={lang} />
            {alert.source === "auto_crowdsourced" && (
              <p lang={lang} className="text-sm text-muted-foreground">
                {t(UNVERIFIED, lang)}
              </p>
            )}
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                {CONFIDENCE_LABEL[lang][alert.confidence]}
              </Badge>
              <div className="flex flex-wrap items-center gap-2">
                <ReadAloudButton text={`${zone.name}. ${t(alert.message, lang)}`} lang={lang} />
                <ShareAlertButton alert={alert} zone={zone} />
              </div>
            </div>
          </>
        ) : (
          <p lang={lang} className="text-muted-foreground">
            {t(NO_ACTIVE_ALERT, lang)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
