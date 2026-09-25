import { t } from "./i18n";
import type { LanguageCode, LocalizedText } from "./types";

const KNOWN: [RegExp, LocalizedText][] = [
  [/invalid login credentials/i, { en: "Wrong email or password.", fil: "Mali ang email o password." }],
  [/email not confirmed/i, { en: "Confirm your email first, then sign in.", fil: "I-confirm muna ang email, saka mag-sign in." }],
  [/^no session/i, { en: "Your sign-in expired — sign in again.", fil: "Nag-expire ang iyong sign-in — mag-sign in muli." }],
  [/those answers don't match/i, { en: "Those answers don't match.", fil: "Hindi tugma ang mga sagot." }],
  [/too many tries/i, { en: "Too many tries. Try again in an hour.", fil: "Masyadong maraming subok. Subukan ulit pagkalipas ng isang oras." }],
  [/enter the email you signed up with/i, { en: "Enter the email you signed up with.", fil: "Ilagay ang email na ginamit mo sa pag-sign up." }],
  [/at least 6 characters/i, { en: "Use at least 6 characters for the new password.", fil: "Gumamit ng hindi bababa sa 6 na titik para sa bagong password." }],
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
