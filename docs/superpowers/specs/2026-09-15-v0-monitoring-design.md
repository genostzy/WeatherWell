# V0 error and uptime monitoring — design

**Status:** approved in conversation, 15 September 2026.
**Branch:** v0. **Constraint:** free, with **no new accounts and nothing for the owner to paste**. It uses only the Supabase project and GitHub repository the owner already has.

## Why

Today the app shows "Something went wrong loading WeatherWell" when it crashes, and nobody is told. Nothing notices when the site or its database is down. PRD Stage 2 "Done when" requires error/uptime monitoring to be active.

Sentry + UptimeRobot was designed first and rejected by the owner as too much setup. This design keeps that version's privacy rules and replaces the vendors with the owner's own Supabase and GitHub.

## What is watched

1. **Crashes.** These are saved to a new table, `public.app_errors`, in the existing Supabase project:
   - browser: uncaught errors and unhandled promise rejections;
   - the route error screen (`src/app/error.tsx`);
   - a new last-resort `src/app/global-error.tsx`;
   - server: failing pages, route handlers and Server Actions, through Next.js's `instrumentation.ts` `onRequestError` hook. Confirm the hook's name and signature in `node_modules/next/dist/docs/` before writing.
2. **Health.** `GET /api/health` returns:
   - `200 {"status":"ok","database":"ok","recentErrors":<n>}` when the app runs and a trivial Supabase read succeeds within 5 seconds;
   - `503 {"status":"unavailable"}` otherwise.

   It is always `Cache-Control: no-store`, never passes through the service worker's caches, and never includes internal error text. `recentErrors` is a count only: rows saved in the last 15 minutes.
3. **The watcher.** `.github/workflows/monitor.yml` runs every 15 minutes (`cron: "*/15 * * * *"`), plus a manual trigger.
   - It calls the V0 preview's `/api/health`, retrying once after 30 seconds before counting a failure.
   - It fails if the response is not 200, or if `recentErrors > 0`.
   - It also checks that the Hi-Fi production homepage returns 200.
   - A failed scheduled run makes **GitHub email the repository owner** automatically. That email is the alert.

   The job's failure log says which check failed and the count, never error contents.

## Where the watcher lives

GitHub runs scheduled workflows **only from the default branch**, which is `main`. `main` holds only the initial commit, production deploys from `hi-fi`, and V0 previews come from `v0`.

So the workflow file is committed to `main` together with a `vercel.json` that disables Vercel deployments for `main` (`{"git":{"deploymentEnabled":{"main":false}}}`). The push therefore cannot create a broken deployment or touch production.

The same `monitor.yml` is also committed on `v0`, so the branch documents what runs. The `main` copy is the one that runs.

**Pushing to `main` requires the owner's explicit OK at build time.**

The URLs live as plain values at the top of the workflow:
- V0 preview: `https://weatherwell-git-v0-wilsondayritjrapex-5422s-projects.vercel.app`
- Production: `https://weatherwell-wilsondayritjrapex-5422s-projects.vercel.app`

They are public addresses, not secrets.

Known limit, recorded in the PRD: GitHub may delay scheduled runs when it is busy, and disables schedules on a repository with no activity for 60 days. The owner re-enables it with one click in the Actions tab.

## The database side (one migration)

- **Table `public.app_errors`:**

  | Column | Type | Notes |
  |---|---|---|
  | `id` | `bigint identity` | |
  | `occurred_at` | `timestamptz default now()` | |
  | `source` | text | `'client' \| 'server'` |
  | `kind` | text | `'render' \| 'unhandled' \| 'request'` |
  | `message` | text | ≤ 500 chars |
  | `stack` | text | nullable, ≤ 4000 |
  | `route` | text | path only, ≤ 200 |
  | `environment` | text | `'production' \| 'preview'` |
  | `release` | text | nullable, ≤ 64; the Vercel commit SHA |
  | `fingerprint` | text | ≤ 64 |

  CHECK constraints enforce every limit.
- **Grants and RLS:** RLS is enabled with **no policies**. `anon` and `authenticated` have every table privilege revoked, so clients can neither read nor write the table directly.
- **`public.report_app_error(p_source, p_kind, p_message, p_stack, p_route, p_environment, p_release, p_fingerprint) returns void`**
  - `SECURITY DEFINER`, `set search_path = ''`, EXECUTE granted to `anon` and `authenticated`. It is the only writer.
  - It skips the insert when a row with the same fingerprint exists from the last 5 minutes.
  - It skips the insert when more than 300 rows were saved in the last hour. This cap bounds spam and keeps the free database small.
  - It deletes rows older than 30 days, at most 200 per call, which gives retention without pg_cron.
  - It truncates over-long fields rather than raising, because a monitoring call must never itself throw at the caller.
- **`public.recent_app_error_count() returns integer`**
  - `SECURITY DEFINER`, EXECUTE to `anon`, `authenticated`.
  - Counts rows from the last 15 minutes. It reveals a number only.
- Neither function references `private.*`.
- Both functions follow the project rules: definer functions pin `search_path = ''`, and no SECURITY INVOKER plpgsql function references `private.*`.
- The owner reads errors in Supabase → Table Editor → `app_errors`.

## Privacy (RA 10173)

The rules are unchanged from the approved Sentry version. Every report passes through one pure function, `src/lib/monitoring/scrub.ts`, before it leaves the browser or the server:

- **Routes:** keep the path only. Remove query strings and hashes, which covers `?token_hash=` on `/auth/confirm` and `?next=`.
- **Messages and stacks:**
  - redact email addresses and UUIDs;
  - redact coordinate-looking number pairs;
  - redact long token-like strings (≥ 24 URL-safe characters).
- **Never attached:** user id, email, official name, IP, user agent, cookies, request bodies, report or pin contents.
- **Dropped entirely (expected, not bugs):**
  - RLS / permission refusals (`42501`, "row-level security", "not an official");
  - offline and network failures (`Failed to fetch`, `NetworkError`, `AbortError`, `navigator.onLine === false` in the browser);
  - Next.js control-flow signals (`NEXT_REDIRECT`, `NEXT_NOT_FOUND`).
- **Fingerprint:** a short stable hash of the scrubbed message plus the first stack frame, so a repeat groups with its first report.
- **Disclosure:** one added sentence on the consent screen (`src/features/onboarding/consent-notice.tsx`), in both languages:
  - EN: "If the app crashes, an anonymous error report — with no name, location or account — is sent so it can be fixed."
  - FIL: "Kung ma-crash ang app, isang hindi nagpapakilalang ulat ng error — walang pangalan, lokasyon, o account — ay ipinapadala upang maisaayos ito."
- **PRD Privacy & Data:** a row for `app_errors` with its contents and 30-day retention.

## Client and server wiring

- **`src/lib/monitoring/report.ts`** is the one entry point, `reportError(error, { source, kind })`.
  - It runs `scrub`; returns without sending if the error is dropped, if the environment is not production/preview, or if the browser is offline.
  - It sends a POST to the Supabase RPC with the publishable key, `keepalive: true`.
  - Every failure is swallowed. Reporting must never cause a second error.
  - The browser has a per-page-load cap of 10 reports.
- **Environment** comes from `NEXT_PUBLIC_VERCEL_ENV` (client) / `VERCEL_ENV` (server). Anything else is `development`, and **nothing is sent** in development or tests.
- **Release** comes from `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` / `VERCEL_GIT_COMMIT_SHA`. These are system variables Vercel provides, so the owner sets nothing.
- **A small client component, `ErrorReporter`,** is mounted once in the root layout. It adds the `error` and `unhandledrejection` listeners and removes them on unmount.
- **The error screens:**
  - `error.tsx` reports the error it renders, once per error;
  - `global-error.tsx` does the same, with the minimal bilingual message and a reload button it must render itself.
- **Server:** `instrumentation.ts` `onRequestError` reports with `source: 'server'`, `kind: 'request'`.
- **Service worker:** `/api/health` is added to the network-only rule next to the admin routes, and `VERSION` is bumped. The Supabase RPC call is cross-origin and already bypasses the worker.

## Testing

- **`scrub`:**
  - a `/auth/confirm?token_hash=abc` route comes out as `/auth/confirm`;
  - emails, UUIDs, coordinates and long tokens are redacted;
  - each dropped class is dropped;
  - fingerprints are stable across repeats and differ across different errors.
- **`reportError`:**
  - sends nothing in development, offline, or for a dropped error;
  - sends the scrubbed payload in preview;
  - stops after 10;
  - a rejected fetch does not throw.
- **`/api/health`:**
  - returns 200 with the count when Supabase answers;
  - returns 503 on an error or a 5-second timeout;
  - sets `no-store`;
  - never leaks error text.
- **`ErrorReporter`:** reports a window error and an unhandled rejection, and removes its listeners on unmount.
- **Error screens:** `error.tsx` and `global-error.tsx` each report once.
- **Database suite (`rls.sql`):**
  - clients cannot select, insert, update or delete `app_errors` directly;
  - `report_app_error` inserts once;
  - a duplicate fingerprint within 5 minutes is skipped;
  - the hourly cap holds;
  - over-long input is truncated, not raised;
  - `recent_app_error_count` returns the count;
  - rows older than 30 days are removed.
- **Workflow:** the check logic lives in a small script, `scripts/check-health.mjs`, with a unit test. It exits non-zero on non-200, on `recentErrors > 0`, and on an unreachable host, and the log never contains error contents.
- **Live check:**
  1. After deploying V0, trigger one deliberate test error on the preview.
  2. Confirm exactly one scrubbed row in `app_errors`, and `/api/health` reporting `recentErrors: 1`.
  3. Run the workflow manually and see it fail as designed.
  4. Delete the test row and see the next manual run pass.

## Known limits

- Anyone can call `report_app_error`, so a deliberate flood could fill the 300-per-hour cap and hide real reports for that hour. This is accepted for V0: the cap protects the free database, and outages are still caught by the health check, which does not depend on the table. V1 can add a per-source limit if needed.
- Browser `NEXT_PUBLIC_VERCEL_ENV` / `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` rely on Vercel exposing system environment variables, which is its default. If they are missing, the client reports as `development` and sends nothing. The live check catches that.

## Out of scope

- Error dashboards, charts and a triage UI. The owner uses the Supabase Table Editor.
- Performance tracing and session replay.
- Alerting channels beyond GitHub's email.
- Source-map symbolication. Stacks are minified; the release SHA ties a report to the exact commit.
