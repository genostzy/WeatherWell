"use client";

import { LANGUAGES, LANGUAGE_LABEL, t } from "@/lib/i18n";
import type { LanguageCode, LocalizedText } from "@/lib/types";
import { useLanguage } from "./language-provider";

const LANGUAGE_GROUP: LocalizedText = { en: "Language", fil: "Wika" };
/** Short enough that the top bar fits one row on a phone; the full name is the button's accessible name. */
const SHORT: Record<LanguageCode, string> = { en: "EN", fil: "FIL" };

/** One segmented switch rather than two separate buttons. */
export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className="flex shrink-0 rounded-full border-2 border-border p-0.5"
      role="group"
      aria-label={t(LANGUAGE_GROUP, lang)}
    >
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          aria-label={LANGUAGE_LABEL[code]}
          aria-pressed={code === lang}
          onClick={() => setLang(code)}
          className={`min-h-8 min-w-10 rounded-full px-2.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
            code === lang ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {SHORT[code]}
        </button>
      ))}
    </div>
  );
}
