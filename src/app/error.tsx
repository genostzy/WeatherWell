"use client";

import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

/**
 * Root error boundary. Without this, an unexpected render error (e.g.
 * useSelectedZone() throwing because /api/zones answered 200 with an empty
 * zone list — see the I5 finding) fell through to Next's untranslated stack
 * trace screen instead of the localised offline card the rest of this app
 * uses. Kept small on purpose: this is a last resort, not a place to add
 * logic.
 */
const MESSAGE: LocalizedText = {
  en: "Something went wrong loading WeatherWell. Your saved zone and evacuation instructions are still on this device.",
  fil: "May naganap na problema sa pag-load ng WeatherWell. Nasa device mo pa rin ang naka-save mong zone at panuto sa paglikas.",
};
const RETRY: LocalizedText = { en: "Try again", fil: "Subukang muli" };

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { lang } = useLanguage();
  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <p role="alert" lang={lang} className="max-w-md text-center text-sm">
        {t(MESSAGE, lang)}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border-2 border-border px-4 py-2 text-sm font-medium"
      >
        {t(RETRY, lang)}
      </button>
    </div>
  );
}
