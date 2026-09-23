import { t } from "./i18n";
import type { LanguageCode, LocalizedText } from "./types";

const KNOWN: [RegExp, LocalizedText][] = [
  [/invalid login credentials/i, { en: "Wrong email or password.", fil: "Mali ang email o password." }],
  [/email not confirmed/i, { en: "Confirm your email first, then sign in.", fil: "I-confirm muna ang email, saka mag-sign in." }],
  [/^no session/i, { en: "Your sign-in expired — sign in again.", fil: "Nag-expire ang iyong sign-in — mag-sign in muli." }],
];

/**
 * Server and Supabase errors arrive in English (L2). The ones people actually
 * meet get a translation; anything else stays as-is, so an official can still
 * report it, behind a plain Filipino "it didn't go through".
 */
export function friendlyError(message: string, lang: LanguageCode): string {
  const known = KNOWN.find(([pattern]) => pattern.test(message));
  if (known) return t(known[1], lang);
  return lang === "fil" ? `Hindi natuloy — subukan ulit. (${message})` : message;
}
