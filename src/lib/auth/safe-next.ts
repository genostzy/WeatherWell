/**
 * A redirect target from a query string, reduced to a same-origin path.
 * Anything else — another origin, "//host", a backslash the browser would
 * normalise into one — becomes the fallback. Without this, a sign-in link
 * could forward a freshly signed-in official to a lookalike site.
 *
 * TAB/LF/CR are stripped FIRST, before any check runs, because the WHATWG URL
 * parser (`new URL(next, origin)`, used by every caller of this function)
 * strips exactly those three characters anywhere in its input before parsing.
 * A raw value like "/\t//evil.example" starts with "/" and not "//" — every
 * check here would pass it — but the parser sees "//evil.example" once its
 * own stripping runs, and redirects off-origin. Validating a different string
 * than the one the parser will actually consume is the bug; stripping first
 * means this function checks (and returns) the same string the parser will
 * end up parsing.
 */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  const stripped = raw.replace(/[\t\n\r]/g, "");
  if (!stripped.startsWith("/") || stripped.startsWith("//") || stripped.includes("\\")) return fallback;
  return stripped;
}
