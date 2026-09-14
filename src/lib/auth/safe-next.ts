/**
 * A redirect target from a query string, reduced to a same-origin path.
 * Anything else — another origin, "//host", a backslash the browser would
 * normalise into one — becomes the fallback. Without this, a sign-in link
 * could forward a freshly signed-in official to a lookalike site.
 */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}
