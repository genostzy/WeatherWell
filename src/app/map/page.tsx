"use client";

import { BackLink } from "@/components/back-link";
import { ZoneMap } from "@/features/zones/zone-map";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { MOCK_ZONES } from "@/lib/mock-data";
import type { LocalizedText } from "@/lib/types";

const PAGE_TITLE: LocalizedText = { en: "Zones", fil: "Mga Zone" };
const PAGE_INTRO: LocalizedText = {
  en: "Every barangay at once — status, conditions, evacuation center, and what residents are reporting.",
  fil: "Lahat ng barangay nang sabay — katayuan, kondisyon, evacuation center, at ulat ng mga residente.",
};

export default function MapPage() {
  const { lang } = useLanguage();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md space-y-4 md:max-w-2xl lg:max-w-5xl">
        <BackLink />
        <div>
          <h1 className="text-lg font-semibold md:text-xl">{t(PAGE_TITLE, lang)}</h1>
          <p lang={lang} className="text-sm text-muted-foreground">
            {t(PAGE_INTRO, lang)}
          </p>
        </div>
      </div>
      <ZoneMap zones={MOCK_ZONES} />
    </main>
  );
}
