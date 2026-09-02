"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

/**
 * RA 10173 requires consent to be informed, which means informed in a
 * language the person actually reads. The Filipino text discloses the same
 * two collections, the same retention limits, and the same right to decline
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
  phone: {
    en: "WeatherWell also asks for your phone number so it can send SMS alerts if your internet connection drops. It is stored securely and never shared.",
    fil: "Hinihingi rin ng WeatherWell ang iyong numero ng telepono upang makapagpadala ng SMS alert kung mawalan ka ng koneksyon sa internet. Ligtas itong iniimbak at hindi kailanman ibinabahagi.",
  },
  decline: {
    en: "You can decline either and still see public alerts for your area.",
    fil: "Maaari mong tanggihan ang alinman sa dalawa at makikita mo pa rin ang mga pampublikong alerto para sa iyong lugar.",
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
        <p>{t(CONSENT_COPY.phone, lang)}</p>
        <p>{t(CONSENT_COPY.decline, lang)}</p>
        <p className="text-muted-foreground">{t(CONSENT_COPY.legalBasis, lang)}</p>
        <Button onClick={onAccept} className="w-full" size="lg">
          {t(CONSENT_COPY.accept, lang)}
        </Button>
      </CardContent>
    </Card>
  );
}
