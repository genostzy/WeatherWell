import { scrub } from "./scrub";

export type ErrorSource = "client" | "server";
export type ErrorKind = "render" | "unhandled" | "request";

const CAP_PER_LOAD = 10;
let sent = 0;

/** Test-only: the cap is per page load, which a test file is not. */
export function __resetReportCapForTests(): void {
  sent = 0;
}

/**
 * Which deployment this is, from Vercel's system variables. Anything that is
 * not a real production or preview deployment — local dev, tests, a missing
 * variable — reports nothing at all.
 */
export function monitoringEnvironment(): "production" | "preview" | null {
  const env = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || "";
  return env === "production" || env === "preview" ? env : null;
}

/**
 * The one way anything reports an error. Scrubs first, sends second, and
 * swallows every failure: a report that throws would turn one error into two.
 */
export async function reportError(
  error: unknown,
  opts: { source: ErrorSource; kind: ErrorKind; route: string }
): Promise<void> {
  try {
    const environment = monitoringEnvironment();
    if (!environment) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (opts.source === "client" && sent >= CAP_PER_LOAD) return;

    const report = scrub(error, opts.route);
    if (!report) return;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;

    if (opts.source === "client") sent += 1;
    await fetch(`${url}/rest/v1/rpc/report_app_error`, {
      method: "POST",
      keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_source: opts.source,
        p_kind: opts.kind,
        p_message: report.message,
        p_stack: report.stack,
        p_route: report.route,
        p_environment: environment,
        p_release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
        p_fingerprint: report.fingerprint,
      }),
    });
  } catch {
    // Deliberately silent.
  }
}
