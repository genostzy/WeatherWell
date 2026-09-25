"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LanguageCode, LocalizedText } from "@/lib/types";

/**
 * RA 10173 requires consent to be informed, which means informed in a
 * language the person actually reads. The Filipino text discloses the same
 * collections, the same retention limits, and the same right to decline
 * as the English — it is a translation of the disclosure, not a summary of it.
 */
type ConsentItem = {
  id: string;
  text: LocalizedText;
  /** What declining costs; null lists the item under "Always on". */
  ifYouSayNo: LocalizedText | null;
};

// One list, so a new item has to say what declining it costs or land under
// "Always on". A blanket "you can decline any of these" once covered crash
// reports, which cannot be turned off.
export const CONSENT_ITEMS: ConsentItem[] = [
  {
    id: "location",
    text: {
      en: "WeatherWell uses your location to suggest your barangay. While the Home or Report screen is open, it follows your position to show your direction and distance to your evacuation center, and adds it to any water-level report you send. The report keeps that location so the database can check it came from the barangay it names; residents and officials never see it. \"How high am I?\" sends your position, rounded to about 100 m, to Open-Meteo to look up the ground height; WeatherWell does not store it.",
      fil: "Ginagamit ng WeatherWell ang iyong lokasyon upang imungkahi ang iyong barangay. Habang bukas ang Bahay o Ulat na screen, sinusundan nito ang iyong posisyon upang ipakita ang direksyon at layo mo papunta sa iyong evacuation center, at idinadagdag ito sa anumang ulat ng lalim ng tubig na ipapadala mo. Iniimbak ng ulat ang lokasyong iyon upang masuri ng database na galing ito sa barangay na nakasaad dito; hindi ito nakikita ng ibang residente o ng mga opisyal. Ipinapadala ng \"Gaano ako kataas?\" ang iyong posisyon, na binilog sa humigit-kumulang 100 m, sa Open-Meteo upang alamin ang taas ng lupa; hindi ito iniimbak ng WeatherWell.",
    },
    ifYouSayNo: {
      en: "Pick your barangay from the list. Your reports still reach your barangay, but without a location they don't count toward an automatic advisory.",
      fil: "Piliin ang iyong barangay mula sa listahan. Makakarating pa rin sa inyong barangay ang iyong mga ulat, pero kung walang lokasyon, hindi ito bibilangin para sa awtomatikong paalala.",
    },
  },
  // This used to promise SMS alerts from a phone number the app never asked
  // for and could not send to. It now says what really happens.
  {
    id: "alerts",
    text: {
      en: "If you turn on alerts, your browser gives WeatherWell a notification address for this phone. It is stored with your barangay only to send you its alerts, and deleted when you turn alerts off.",
      fil: "Kung i-on mo ang mga alerto, magbibigay ang browser mo sa WeatherWell ng address para sa abiso ng teleponong ito. Iniimbak ito kasama ng iyong barangay para lamang padalhan ka ng alerto nito, at binubura kapag in-off mo ang alerto.",
    },
    ifYouSayNo: {
      en: "You still see your barangay's alerts whenever you open the app.",
      fil: "Makikita mo pa rin ang mga alerto ng inyong barangay tuwing bubuksan mo ang app.",
    },
  },
  {
    id: "neighbours",
    text: {
      en: "Numbers you add for 'Text my neighbours' stay on this phone; WeatherWell never receives them. Texts go from your own phone.",
      fil: "Ang mga numerong idinagdag mo para sa 'I-text ang kapitbahay' ay nananatili sa teleponong ito; hindi ito natatanggap ng WeatherWell. Galing sa sarili mong telepono ang mga text.",
    },
    ifYouSayNo: {
      en: "You can still pass an alert on with the Share Alert button.",
      fil: "Maipapasa mo pa rin ang alerto gamit ang button na Ibahagi.",
    },
  },
  {
    id: "errors",
    text: {
      en: "If the app crashes, an anonymous error report — with no name, location or account — is sent so it can be fixed.",
      fil: "Kung ma-crash ang app, isang hindi nagpapakilalang ulat ng error — walang pangalan, lokasyon, o account — ay ipinapadala upang maisaayos ito.",
    },
    ifYouSayNo: null,
  },
];

const CONSENT_COPY = {
  title: {
    en: "Before you continue",
    fil: "Bago ka magpatuloy",
  },
  youChoose: {
    en: "You choose",
    fil: "Ikaw ang pipili",
  },
  alwaysOn: {
    en: "Always on",
    fil: "Laging naka-on",
  },
  ifYouSayNo: {
    en: "If you say no:",
    fil: "Kung tatanggi ka:",
  },
  legalBasis: {
    en: "Under the Data Privacy Act of 2012 (RA 10173), what you choose above is collected only with your consent.",
    fil: "Sa ilalim ng Data Privacy Act of 2012 (RA 10173), kinokolekta lamang ang mga pinili mo sa itaas nang may iyong pahintulot.",
  },
  accept: {
    en: "I understand",
    fil: "Naiintindihan ko",
  },
} satisfies Record<string, LocalizedText>;

function ConsentGroup({
  heading,
  items,
  lang,
}: {
  heading: LocalizedText;
  items: ConsentItem[];
  lang: LanguageCode;
}) {
  const headingId = useId();

  return (
    <section className="space-y-2">
      <h2 id={headingId} className="font-semibold">
        {t(heading, lang)}
      </h2>
      <ul aria-labelledby={headingId} className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="space-y-1">
            <p>{t(item.text, lang)}</p>
            {item.ifYouSayNo && (
              <p className="text-muted-foreground">
                <span className="font-medium">{t(CONSENT_COPY.ifYouSayNo, lang)}</span>{" "}
                <span>{t(item.ifYouSayNo, lang)}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ConsentNotice({ onAccept }: { onAccept: () => void }) {
  const { lang } = useLanguage();

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle lang={lang}>{t(CONSENT_COPY.title, lang)}</CardTitle>
      </CardHeader>
      <CardContent lang={lang} className="space-y-4 text-sm">
        <ConsentGroup
          heading={CONSENT_COPY.youChoose}
          items={CONSENT_ITEMS.filter((item) => item.ifYouSayNo)}
          lang={lang}
        />
        <ConsentGroup
          heading={CONSENT_COPY.alwaysOn}
          items={CONSENT_ITEMS.filter((item) => !item.ifYouSayNo)}
          lang={lang}
        />
        <p className="text-muted-foreground">{t(CONSENT_COPY.legalBasis, lang)}</p>
        <Button onClick={onAccept} className="w-full" size="lg">
          {t(CONSENT_COPY.accept, lang)}
        </Button>
      </CardContent>
    </Card>
  );
}
