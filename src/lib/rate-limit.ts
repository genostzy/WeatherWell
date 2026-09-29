/**
 * Counts requests per key in fixed windows and says whether one more fits.
 *
 * ponytail: the counts live in this server instance's memory, so each warm
 * instance allows the full limit on its own; move them into the database if
 * several instances ever run at once for long.
 */
export function createRateLimiter(max: number, windowMs: number): (key: string) => boolean {
  const windows = new Map<string, { start: number; count: number }>();

  return (key) => {
    const now = Date.now();
    const current = windows.get(key);
    if (current && now - current.start < windowMs) {
      if (current.count >= max) return false;
      current.count++;
      return true;
    }
    // A new window. Now and then forget the keys whose window has passed, so the map stays small.
    if (windows.size >= 1_000) {
      for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
    }
    windows.set(key, { start: now, count: 1 });
    return true;
  };
}

/** The caller's address: the first X-Forwarded-For entry, which Vercel's edge sets. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
