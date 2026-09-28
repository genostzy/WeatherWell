import type { LanguageCode, LocalizedText, Zone } from "./types";

/**
 * The rules for what an official enters as their barangay's details. The
 * database function set_barangay_details enforces the same rules; the form
 * checks them first so the official reads the problem in their language,
 * and friendlyError maps the database's wording to these same messages.
 */
export const MAX_HOTLINES = 3;
export const MAX_INSTRUCTIONS = 1000;

export const NOT_AN_OFFICIAL: LocalizedText = {
  en: "You don't manage this barangay.",
  fil: "Hindi mo pinamamahalaan ang barangay na ito.",
};
export const TOO_MANY_HOTLINES: LocalizedText = {
  en: "Enter at most 3 hotline numbers.",
  fil: "Hanggang 3 hotline number lang.",
};
export const BAD_HOTLINE: LocalizedText = {
  en: "A hotline number uses 3 to 20 digits, spaces and + - ( ).",
  fil: "Ang hotline number ay 3 hanggang 20 digit, espasyo at + - ( ).",
};
export const ALL_ZEROS_HOTLINE: LocalizedText = {
  en: "A hotline number can't be all zeros.",
  fil: "Hindi puwedeng puro zero ang hotline number.",
};
export const NO_INSTRUCTIONS: LocalizedText = {
  en: "Write the instructions in English or Filipino.",
  fil: "Isulat ang mga tagubilin sa English o Filipino.",
};
export const LONG_INSTRUCTIONS: LocalizedText = {
  en: "Keep the instructions to 1,000 characters.",
  fil: "Hanggang 1,000 titik lang ang mga tagubilin.",
};
export const CENTRE_TOO_FAR: LocalizedText = {
  en: "The centre must be within 5 km of the barangay.",
  fil: "Dapat nasa loob ng 5 km mula sa barangay ang center.",
};

const HOTLINE_SHAPE = /^[0-9+() -]{3,20}$/;

/** What is wrong with one number an official typed, or null when it is fine. */
export function hotlineProblem(number: string): LocalizedText | null {
  const trimmed = number.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!HOTLINE_SHAPE.test(trimmed) || digits.length < 3) return BAD_HOTLINE;
  if (/^0+$/.test(digits)) return ALL_ZEROS_HOTLINE;
  return null;
}

/** What is wrong with the instructions, or null: one language is enough. */
export function instructionsProblem(instructions: { en: string; fil: string }): LocalizedText | null {
  const en = instructions.en.trim();
  const fil = instructions.fil.trim();
  if (en === "" && fil === "") return NO_INSTRUCTIONS;
  if (en.length > MAX_INSTRUCTIONS || fil.length > MAX_INSTRUCTIONS) return LONG_INSTRUCTIONS;
  return null;
}

/**
 * A call link for a number as an official wrote it: "(075) 522-1234" dials
 * 0755221234. A plus before the first digit is the country code's, brackets
 * or not: "(+63) 917 123 4567" dials +639171234567.
 */
export function telHref(number: string): string {
  const plus = /^[^0-9]*\+/.test(number) ? "+" : "";
  return `tel:${plus}${number.replace(/[^0-9]/g, "")}`;
}

/**
 * What the nationwide seed gave every barangay as its instructions. The form
 * does not offer it back as the official's own words: saved unchanged, it
 * would stand in for a language the official left blank.
 */
export const PLACEHOLDER_INSTRUCTIONS: LocalizedText = {
  en: "Contact your barangay captain for evacuation instructions.",
  fil: "Makipag-ugnayan sa inyong barangay captain para sa mga tagubilin sa paglikas.",
};

/**
 * A barangay's instructions for a reader of one language, and the language
 * they are actually in. An official may write only one; the other language's
 * reader gets that text, marked with its real language so screen readers and
 * read-aloud pronounce it right (WCAG 3.1.2).
 */
export function instructionsFor(
  zone: Pick<Zone, "evacuationRouteText">,
  lang: LanguageCode
): { text: string; lang: LanguageCode } {
  const own = zone.evacuationRouteText[lang];
  if (own) return { text: own, lang };
  const other: LanguageCode = lang === "en" ? "fil" : "en";
  return { text: zone.evacuationRouteText[other], lang: other };
}
