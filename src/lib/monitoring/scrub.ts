/**
 * The one privacy gate every error report passes before it leaves the device
 * or the server (RA 10173). A report says what broke and where in the code —
 * never who it happened to, where they were, or what they had submitted.
 * Returns null for failures that are expected, not bugs: refusals the
 * database is designed to give, being offline, Next's control-flow throws,
 * and errors thrown inside a browser extension's own script.
 *
 * Privacy beats debuggability throughout `redact()` below: every rule is
 * deliberately broad, and some (the "key" trigger word, the 8+ hex-char rule)
 * will occasionally redact something harmless. A crash report that reads
 * "[redacted]" is still useful. A report that leaks a resident's phone
 * number or location breaks RA 10173 and the consent screen's promise.
 */
export interface ScrubbedReport {
  message: string;
  stack: string | null;
  route: string;
  fingerprint: string;
}

const DROP_PATTERNS = [
  /row-level security/i,
  /\b42501\b/,
  /not an official/i,
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /NEXT_REDIRECT/,
  /NEXT_NOT_FOUND/,
];

// A browser extension's own script: code the app never shipped, so its
// crashes are not the app's to fix, and one noisy extension fails the monitor.
const EXTENSION_URL = /\b(?:chrome|moz|safari|safari-web|ms-browser)-extension:\/\//;

/** The frame that threw: V8 writes "    at fn (url:1:2)", Gecko and WebKit "fn@url:1:2". */
function throwingFrame(stack: string): string {
  return stack.split("\n").find((line) => /^\s*at\s/.test(line) || /@\S*:\d+:\d+$/.test(line.trim())) ?? "";
}

// Keys whose value is a secret, however it is joined to the key
// ("token=x", "token: x", "Bearer x"). "key" and "code" are deliberately
// included even though they are common English words elsewhere — an
// occasional over-redacted word is the acceptable cost of not missing a
// short OAuth code or access token.
const SECRET_KEY_VALUE =
  /\b(?:token_hash|access_token|refresh_token|api[_-]?key|apikey|token|code|password|secret|authorization|bearer|key)\b[:=]?\s*["']?[^\s&,;"')]+/gi;

// A key that names a coordinate, with its value, however it is joined.
const COORD_KEY_VALUE = /\b(?:lat|lng|latitude|longitude|lon)\b\s*[:=]\s*-?\d{1,3}(?:\.\d+)?/gi;

// A JWT-shaped token: three dot-separated URL-safe base64 segments, of any
// length — the existing 24+-char rule alone misses short-segment JWTs.
const JWT_LIKE = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// Cheap IPv6 coverage: requires at least 4 groups, so an ordinary "HH:MM:SS"
// clock reading (3 groups) is not mistaken for an address. A compressed
// "::" address is only partially matched (the run after the "::"), which is
// an accepted, documented limitation of this being a cheap heuristic.
const IPV6 = /\b(?:[0-9a-fA-F]{1,4}:){3,7}[0-9a-fA-F]{1,4}\b/g;

// A Philippine mobile number, local (09...) or international (+639...),
// with or without spaces/dashes between groups.
const PH_PHONE = /(?:\+?63[-.\s]?|0)9\d{2}[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
// Any other run of 10+ digits, loosely punctuated — a phone number (or any
// other identifying number) in a shape the pattern above does not name.
const LONG_DIGIT_RUN = /\d(?:[\s.-]?\d){9,}/g;

// Two lat/lng-shaped decimals next to each other, comma- or space-separated
// — catches both "16.0288, 120.4366" and "16.02 120.43".
const COORD_PAIR = /-?\d{1,3}\.\d{2,}(?:\s*,\s*|\s+)-?\d{1,3}\.\d{2,}/g;
// A single high-precision decimal in a plausible lat/lng range, once any
// pair or keyed coordinate above has already been redacted — a lone leaked
// coordinate (only latitude, say) is still a location.
const SOLO_COORD = /-?\d{1,3}\.\d{3,}\b/g;

// Any whitespace-delimited run containing "@" — catches a normal email and
// one split across a stray newline (the run either side of the break still
// contains "@"), at the cost of also eating adjacent punctuation.
const EMAIL_RUN = /\S*@\S*/g;

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// Any standalone run of 8+ hex characters — catches a UUID (or the half of
// one left over after a newline split it apart) that the exact pattern
// above missed. Deliberately not "the whole UUID or nothing": the two
// surviving 4-character segments in a split UUID are not enough entropy to
// re-identify anyone.
const HEX_RUN = /\b[0-9a-f]{8,}\b/gi;

const LONG_TOKEN = /[A-Za-z0-9_-]{24,}/g;

function redact(text: string): string {
  return text
    .replace(SECRET_KEY_VALUE, "[token]")
    .replace(COORD_KEY_VALUE, "[coords]")
    .replace(JWT_LIKE, "[token]")
    .replace(IPV4, "[ip]")
    .replace(IPV6, "[ip]")
    .replace(PH_PHONE, "[phone]")
    .replace(LONG_DIGIT_RUN, "[phone]")
    .replace(COORD_PAIR, "[coords]")
    .replace(SOLO_COORD, "[num]")
    .replace(EMAIL_RUN, "[email]")
    .replace(UUID, "[id]")
    .replace(HEX_RUN, "[id]")
    .replace(LONG_TOKEN, "[token]");
}

function pathOnly(route: string): string {
  try {
    return new URL(route, "http://x").pathname;
  } catch {
    return route.split(/[?#]/)[0] || "/";
  }
}

/** FNV-1a, 32-bit, hex. Stable and dependency-free; not for security. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function scrub(error: unknown, route: string): ScrubbedReport | null {
  const isError = error instanceof Error;
  const rawMessage = isError ? error.message : String(error);
  const name = isError ? error.name : "";
  if (name === "AbortError" || DROP_PATTERNS.some((p) => p.test(rawMessage))) return null;
  if (isError && error.stack && EXTENSION_URL.test(throwingFrame(error.stack))) return null;

  const message = redact(rawMessage);
  const stack = isError && error.stack ? redact(error.stack) : null;
  const firstFrame = stack?.split("\n").find((line) => line.trim().startsWith("at ")) ?? "";
  return { message, stack, route: pathOnly(route), fingerprint: hash(`${message}\n${firstFrame.trim()}`) };
}
