"use client";

import { useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RelayButton } from "@/features/relay/relay";
import { ShareAlertButton } from "./share-alert-button";
import { t } from "@/lib/i18n";
import { useHasHydrated } from "@/lib/use-hydrated";
import { minutesSinceReport } from "@/lib/water-level-reports";
import type { AlertRecord, LanguageCode, LocalizedText, Zone } from "@/lib/types";

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

const noSubscribe = () => () => {};

/** The browser's own speech (free, on-device, works offline) for residents who find reading hard. */
function ReadAloudButton({ text, lang }: { text: string; lang: LanguageCode }) {
  const canSpeak = useSyncExternalStore(noSubscribe, () => typeof window !== "undefined" && !!window.speechSynthesis, () => false);
  if (!canSpeak) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
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

/**
 * An official's alert stays active until someone lowers it (idea 13), so a
 * forgotten one can look current for days. Client-only, like TimeAgo: the
 * age reads the clock.
 */
function AlertAge({ issuedAt, lang }: { issuedAt: string; lang: LanguageCode }) {
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

/** What a resident needs beside an active alert: how old it is, whether an official confirmed it, a way to hear it, and ways to pass it on. */
export function AlertDetails({ alert, zone, lang }: { alert: AlertRecord; zone: Zone; lang: LanguageCode }) {
  return (
    <div className="mt-2 space-y-1">
      <AlertAge issuedAt={alert.issuedAt} lang={lang} />
      {alert.source === "auto_crowdsourced" && (
        <p lang={lang} className="text-xs text-muted-foreground">
          {t(UNVERIFIED, lang)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <ReadAloudButton text={`${zone.name}. ${t(alert.message, lang)}`} lang={lang} />
        <ShareAlertButton alert={alert} zone={zone} />
        <RelayButton alert={alert} zone={zone} />
      </div>
    </div>
  );
}
