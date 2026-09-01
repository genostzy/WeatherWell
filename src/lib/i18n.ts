import type { LanguageCode, LocalizedText } from "./types";

export const LANGUAGE_LABEL: Record<LanguageCode, string> = {
  en: "English",
  fil: "Filipino",
};

export const LANGUAGES: LanguageCode[] = ["en", "fil"];

/** Reads localized copy, falling back to English if a translation is missing. */
export function t(text: LocalizedText, lang: LanguageCode): string {
  return text[lang] || text.en;
}
