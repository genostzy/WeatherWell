"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

/**
 * RA 10173 requires consent to be informed, which means informed in a
 * language the person actually reads. The Filipino text discloses the same
 * collections, the same retention limits, and the same right to decline
 * as the English — it is a translation of the disclosure, not a summary of it.
 */
const CONSENT_COPY = {
  title: {
    en: "Before you continue",
    fil: "Bago ka magpatuloy",
  },
  location: {
    en: "WeatherWell asks for your location to match you to your barangay zone and to confirm water-level reports come from where you say they do. It is not stored beyond validating a report.",
    fil: "Hinihingi ng WeatherWell ang iyong lokasyon upang itugma ka sa iyong barangay zone at upang matiyak na ang mga ulat ng lalim ng tubig ay talagang mula sa lugar na sinasabi mo. Hindi ito iniimbak matapos masuri ang isang ulat.",
  },
  liveLocation: {
    en: "Separately, while the homepage map is open, WeatherWell also tracks your device's position continuously (at a low frequency) to show your direction and distance to your evacuation center. This is never stored — it exists only while the map is on screen.",
    fil: "Bukod dito, habang bukas ang mapa sa homepage, sinusubaybayan din ng WeatherWell ang posisyon ng iyong device nang tuloy-tuloy (sa mababang dalas) upang ipakita ang direksyon at layo mo papunta sa iyong evacuation center. Hindi ito iniimbak — umiiral lamang ito habang nakabukas ang mapa.",
  },
  // This used to promise SMS alerts from a phone number the app never asked
  // for and could not send to. It now says what really happens.
  alerts: {
    en: "If you turn on alerts, your browser gives WeatherWell a notification address for this phone. It is stored with your barangay only to send you its alerts, and deleted when you turn alerts off.",
    fil: "Kung i-on mo ang mga alerto, magbibigay ang browser mo sa WeatherWell ng address para sa abiso ng teleponong ito. Iniimbak ito kasama ng iyong barangay para lamang padalhan ka ng alerto nito, at binubura kapag in-off mo ang alerto.",
  },
  neighbours: {
    en: "Numbers you add for 'Text my neighbours' stay on this phone; WeatherWell never receives them. Texts go from your own phone.",
    fil: "Ang mga numerong idinagdag mo para sa 'I-text ang kapitbahay' ay nananatili sa teleponong ito; hindi ito natatanggap ng WeatherWell. Galing sa sarili mong telepono ang mga text.",
  },
  errors: {
    en: "If the app crashes, an anonymous error report — with no name, location or account — is sent so it can be fixed.",
    fil: "Kung ma-crash ang app, isang hindi nagpapakilalang ulat ng error — walang pangalan, lokasyon, o account — ay ipinapadala upang maisaayos ito.",
  },
  decline: {
    en: "You can decline any of these and still see public alerts for your area.",
    fil: "Maaari mong tanggihan ang alinman sa mga ito at makikita mo pa rin ang mga pampublikong alerto para sa iyong lugar.",
  },
  legalBasis: {
    en: "Collected under the Data Privacy Act of 2012 (RA 10173) with your consent.",
    fil: "Kinokolekta sa ilalim ng Data Privacy Act of 2012 (RA 10173) nang may iyong pahintulot.",
  },
  accept: {
    en: "I understand",
    fil: "Naiintindihan ko",
  },
} satisfies Record<string, LocalizedText>;

export function ConsentNotice({ onAccept }: { onAccept: () => void }) {
  const { lang } = useLanguage();

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle lang={lang}>{t(CONSENT_COPY.title, lang)}</CardTitle>
      </CardHeader>
      <CardContent lang={lang} className="space-y-4 text-sm">
        <p>{t(CONSENT_COPY.location, lang)}</p>
        <p>{t(CONSENT_COPY.liveLocation, lang)}</p>
        <p>{t(CONSENT_COPY.alerts, lang)}</p>
        <p>{t(CONSENT_COPY.neighbours, lang)}</p>
        <p>{t(CONSENT_COPY.errors, lang)}</p>
        <p>{t(CONSENT_COPY.decline, lang)}</p>
        <p className="text-muted-foreground">{t(CONSENT_COPY.legalBasis, lang)}</p>
        <Button onClick={onAccept} className="w-full" size="lg">
          {t(CONSENT_COPY.accept, lang)}
        </Button>
      </CardContent>
    </Card>
  );
}
