/**
 * The one privacy gate every error report passes before it leaves the device
 * or the server (RA 10173). A report says what broke and where in the code —
 * never who it happened to, where they were, or what they had submitted.
 * Returns null for failures that are expected, not bugs: refusals the
 * database is designed to give, being offline, and Next's control-flow throws.
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

function redact(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/-?\d{1,3}\.\d{2,}\s*,\s*-?\d{1,3}\.\d{2,}/g, "[coords]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[token]");
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

  const message = redact(rawMessage);
  const stack = isError && error.stack ? redact(error.stack) : null;
  const firstFrame = stack?.split("\n").find((line) => line.trim().startsWith("at ")) ?? "";
  return { message, stack, route: pathOnly(route), fingerprint: hash(`${message}\n${firstFrame.trim()}`) };
}
