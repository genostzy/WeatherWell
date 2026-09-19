"use client";

import { BackLink } from "@/components/back-link";
import { ZoneMap } from "@/features/zones/zone-map";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useZones } from "@/lib/reference-data/use-reference-data";
import type { LocalizedText } from "@/lib/types";

const PAGE_TITLE: LocalizedText = { en: "Zones", fil: "Mga Zone" };

export default function MapPage() {
  const { lang } = useLanguage();
  const zones = useZones();

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md space-y-3 md:max-w-2xl lg:max-w-5xl">
        <BackLink />
        <h1 className="text-lg font-semibold md:text-xl">{t(PAGE_TITLE, lang)}</h1>
      </div>
      <ZoneMap zones={zones} />
    </main>
  );
}
