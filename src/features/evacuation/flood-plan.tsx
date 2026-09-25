"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useZones } from "@/lib/reference-data/use-reference-data";
import { SEVERITY_HEX, SEVERITY_LABEL, SEVERITY_ORDER, type Severity } from "@/lib/severity";
import { hasRealEvacuationCenter, hasRealHotline, NO_VERIFIED_CENTER } from "@/lib/zone-data-quality";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Flood plan", fil: "Plano sa baha" };
const WHERE: LocalizedText = { en: "Where to go", fil: "Saan pupunta" };
const CAPACITY: LocalizedText = { en: "Room for about {n} people", fil: "May lugar para sa mga {n} tao" };
const CALL: LocalizedText = { en: "Who to call", fil: "Sino ang tatawagan" };
const BARANGAY: LocalizedText = { en: "Barangay", fil: "Barangay" };
const NO_HOTLINE: LocalizedText = { en: "No verified barangay hotline yet", fil: "Wala pang beripikadong hotline ng barangay" };
const EMERGENCY: LocalizedText = { en: "National emergency", fil: "Pambansang emergency" };
const LEVELS: LocalizedText = { en: "What each alert means", fil: "Ano ang ibig sabihin ng bawat alerto" };
const BRING: LocalizedText = { en: "What to bring", fil: "Ano ang dadalhin" };
const SCAN: LocalizedText = { en: "Scan to get alerts on your phone", fil: "I-scan para makatanggap ng alerto sa telepono" };
const PRINT: LocalizedText = { en: "Print this plan", fil: "I-print ang planong ito" };
const NOT_FOUND: LocalizedText = { en: "No such barangay.", fil: "Walang ganitong barangay." };

const DO: Record<Severity, LocalizedText> = {
  yellow: { en: "Flooding is possible. Stay informed and check on neighbours.", fil: "Posible ang baha. Manatiling may alam at kumustahin ang kapitbahay." },
  orange: { en: "Flooding is likely. Pack your go-bag and move valuables up.", fil: "Malamang ang baha. Ihanda ang go-bag at itaas ang mahahalagang gamit." },
  red: { en: "Flooding is expected. Be ready to leave; help the elderly and children first.", fil: "Inaasahan ang baha. Maging handang umalis; unahin ang matatanda at bata." },
  evacuate: { en: "Leave now for the evacuation centre or higher ground.", fil: "Umalis na papunta sa evacuation center o mataas na lugar." },
};

const GO_BAG: LocalizedText[] = [
  { en: "Drinking water and food for 3 days", fil: "Inuming tubig at pagkain para sa 3 araw" },
  { en: "Medicines and a copy of prescriptions", fil: "Gamot at kopya ng reseta" },
  { en: "IDs and important papers in a plastic bag", fil: "ID at mahahalagang papeles sa plastik" },
  { en: "Phone, charger and power bank", fil: "Telepono, charger at power bank" },
  { en: "Flashlight, whistle and spare batteries", fil: "Flashlight, pito at ekstrang baterya" },
  { en: "Clothes, blanket and hygiene kit", fil: "Damit, kumot at hygiene kit" },
];

/**
 * A one-page flood plan for one barangay, made to print: for the barangay
 * hall, the chapel door, a fridge. It reaches the people without phones, and
 * works when the power and signal are gone. Says so plainly when the
 * barangay has no verified centre or hotline yet.
 */
export function FloodPlan({ zoneId }: { zoneId: string }) {
  const { lang } = useLanguage();
  const zone = useZones().find((z) => z.id === zoneId);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(window.location.origin, { margin: 1, width: 240 }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!zone) return <p lang={lang}>{t(NOT_FOUND, lang)}</p>;
  const realCentre = hasRealEvacuationCenter(zone);

  return (
    <article className="mx-auto w-full max-w-2xl space-y-6 bg-background print:max-w-none print:bg-white print:text-black">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p lang={lang} className="text-sm font-medium text-muted-foreground print:text-gray-600">
            {t(TITLE, lang)} · WeatherWell
          </p>
          <h1 className="text-2xl font-bold">{zone.name}</h1>
        </div>
        <Button type="button" size="lg" onClick={() => window.print()} className="print:hidden">
          <Printer aria-hidden="true" />
          <span lang={lang}>{t(PRINT, lang)}</span>
        </Button>
      </header>

      <section className="space-y-1">
        <h2 lang={lang} className="text-lg font-semibold">
          {t(WHERE, lang)}
        </h2>
        {realCentre ? (
          <>
            <p className="text-xl font-bold">{zone.evacuationCenterName}</p>
            {zone.evacuationCenterCapacity > 0 && (
              <p lang={lang}>{t(CAPACITY, lang).replace("{n}", String(zone.evacuationCenterCapacity))}</p>
            )}
            <p lang={lang}>{t(zone.evacuationRouteText, lang)}</p>
          </>
        ) : (
          <p lang={lang} className="font-medium">
            {t(NO_VERIFIED_CENTER, lang)}
          </p>
        )}
      </section>

      <section className="space-y-1">
        <h2 lang={lang} className="text-lg font-semibold">
          {t(CALL, lang)}
        </h2>
        <p>
          <span lang={lang}>{t(BARANGAY, lang)}: </span>
          {hasRealHotline(zone) ? (
            <span className="font-bold">{zone.hotlineNumber}</span>
          ) : (
            <span lang={lang}>{t(NO_HOTLINE, lang)}</span>
          )}
        </p>
        <p>
          <span lang={lang}>{t(EMERGENCY, lang)}: </span>
          <span className="font-bold">911</span>
        </p>
      </section>

      <section className="space-y-2">
        <h2 lang={lang} className="text-lg font-semibold">
          {t(LEVELS, lang)}
        </h2>
        <ul className="space-y-2">
          {SEVERITY_ORDER.map((severity) => (
            <li key={severity} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-1 h-4 w-4 shrink-0 rounded-full print:[print-color-adjust:exact]"
                style={{ backgroundColor: SEVERITY_HEX[severity] }}
              />
              <p lang={lang}>
                <span className="font-semibold">{t(SEVERITY_LABEL[severity], lang)}:</span> {t(DO[severity], lang)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 lang={lang} className="text-lg font-semibold">
          {t(BRING, lang)}
        </h2>
        <ul className="grid list-disc gap-1 pl-5 sm:grid-cols-2">
          {GO_BAG.map((item) => (
            <li key={item.en} lang={lang}>
              {t(item, lang)}
            </li>
          ))}
        </ul>
      </section>

      {qr && (
        <section className="flex items-center gap-4 border-t border-border pt-4 print:border-gray-300">
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, nothing to optimise */}
          <img src={qr} alt={t(SCAN, lang)} width={120} height={120} className="rounded bg-white p-1" />
          <p lang={lang} className="font-medium">
            {t(SCAN, lang)}
          </p>
        </section>
      )}
    </article>
  );
}

const PRINT_LINK: LocalizedText = { en: "Print the barangay's flood plan", fil: "I-print ang plano sa baha ng barangay" };

/** The way to the printable plan, from the Evacuate page and an official's barangay page. */
export function FloodPlanLink({ zoneId }: { zoneId: string }) {
  const { lang } = useLanguage();
  return (
    <Button asChild variant="outline" size="lg" className="w-full">
      <Link href={`/plan/${zoneId}`}>
        <Printer aria-hidden="true" />
        <span lang={lang}>{t(PRINT_LINK, lang)}</span>
      </Link>
    </Button>
  );
}
