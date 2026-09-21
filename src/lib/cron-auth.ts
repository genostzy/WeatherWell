import "server-only";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on every scheduled
 * invocation of a path listed in vercel.json. Without this check, a cron
 * route holding the service-role key (bypasses RLS) would accept a request
 * from anyone on the internet — repeatedly re-running a paid third-party
 * fetch, or re-triggering a bulk delete/write, on demand.
 *
 * Fails closed: a request is authorized only when CRON_SECRET is set AND
 * the header matches it exactly. A deploy that forgot to set the secret
 * must refuse every request, never accept every request.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
