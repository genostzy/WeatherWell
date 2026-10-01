import { t } from "@/lib/i18n";
import type { AlertRecord, ConfidenceLevel, LanguageCode, LocalizedText } from "@/lib/types";

const LABEL: Record<ConfidenceLevel, LocalizedText> = {
  estimated: { en: "Estimated", fil: "Tantiya" },
  validated: { en: "Validated", fil: "Napatunayan" },
  calibrated: { en: "Calibrated", fil: "Naisaayos" },
};

/** What each level means for an automatic advisory, from its barangay's record (PRD, "Confidence tagging"). */
const MEANING: Record<ConfidenceLevel, LocalizedText> = {
  estimated: {
    en: "This barangay's automatic advisories haven't been checked against real floods yet.",
    fil: "Hindi pa naihahambing sa totoong baha ang mga awtomatikong paalala ng barangay na ito.",
  },
  validated: {
    en: "Officials have confirmed several of this barangay's automatic advisories.",
    fil: "Kinumpirma na ng mga opisyal ang ilang awtomatikong paalala ng barangay na ito.",
  },
  calibrated: {
    en: "Tuned against this barangay's past floods.",
    fil: "Inayos batay sa mga nakaraang baha ng barangay na ito.",
  },
};

const SET_BY_AN_OFFICIAL: LocalizedText = { en: "Set by an official.", fil: "Itinakda ng isang opisyal." };
const FORECAST: LocalizedText = { en: "Forecast", fil: "Pagtataya" };
const FROM_THE_FORECAST: LocalizedText = {
  en: "From the rain forecast, not from reports.",
  fil: "Mula sa forecast ng ulan, hindi sa mga ulat.",
};

/**
 * How much an alert can be trusted, always shown (PRD: "never hidden behind a
 * number that implies more certainty than exists").
 */
export function ConfidenceTag({
  source,
  confidence,
  lang,
}: {
  source: AlertRecord["source"];
  confidence: ConfidenceLevel;
  lang: LanguageCode;
}) {
  // A Forecast advisory has no track record to speak of: it says what it is instead.
  const forecast = source === "predicted";
  return (
    <p lang={lang} className="text-xs text-muted-foreground">
      <span className="font-semibold">{t(forecast ? FORECAST : LABEL[confidence], lang)}:</span>{" "}
      {t(forecast ? FROM_THE_FORECAST : source === "manual" ? SET_BY_AN_OFFICIAL : MEANING[confidence], lang)}
    </p>
  );
}
