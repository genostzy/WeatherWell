import { t } from "./i18n";
import type { LanguageCode, LocalizedText } from "./types";

const JUST_NOW: LocalizedText = { en: "just now", fil: "ngayon lang" };
const MINUTES: LocalizedText = { en: "{n} min ago", fil: "{n} min ang nakaraan" };
const HOURS: LocalizedText = { en: "{n} h ago", fil: "{n} oras ang nakaraan" };
const DAYS: LocalizedText = { en: "{n} days ago", fil: "{n} araw ang nakaraan" };

/** "8 min ago", "45 h ago", "7 days ago": minutes for an hour, hours for two days, then days. */
export function formatAge(minutes: number, lang: LanguageCode): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 1) return t(JUST_NOW, lang);
  if (m < 60) return t(MINUTES, lang).replace("{n}", String(m));
  if (m < 48 * 60) return t(HOURS, lang).replace("{n}", String(Math.floor(m / 60)));
  return t(DAYS, lang).replace("{n}", String(Math.floor(m / (24 * 60))));
}
