# V0 Error and Uptime Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crashes are saved, scrubbed, to the owner's own Supabase. A GitHub job emails the owner when the V0 site or its database is down, or when new crashes appear. The owner creates no accounts and pastes nothing.

**Architecture:**
- **Writes:** one `SECURITY DEFINER` RPC, `public.report_app_error`, is the only writer to a locked-down `public.app_errors` table. It handles dedupe, a rate cap and 30-day cleanup.
- **Reporting:** browser and server both funnel through one pure `scrub()` and one `reportError()`.
- **Health:** `/api/health` reports database reachability plus a recent-error count.
- **Alerting:** a scheduled GitHub workflow on `main` (the only branch GitHub schedules from) turns a bad health result into GitHub's own failure email.

**Tech Stack:** Next.js 16.3.4 (App Router, `instrumentation.ts`), Supabase Postgres + PostgREST RPC, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-v0-monitoring-design.md`

## Global Constraints

- **Framework:** Next.js 16.3.4 differs from training data. Read `node_modules/next/dist/docs/` before writing routes, error files or `instrumentation.ts`. `instrumentation.md` and `error.md` are under `01-app/03-api-reference/03-file-conventions/`.
- **Keys and trust:** never import a secret or service-role key into `src/`; the publishable key is the only key. Server trust uses `getClaims()`, never `getSession()`.
- **Supabase:**
  - Never create a Supabase branch.
  - Never revoke EXECUTE from `authenticated` on `private.is_operator` / `private.manages_zone`.
  - No SECURITY INVOKER plpgsql function may reference `private.*`.
  - Definer functions pin `set search_path = ''`.
- **Live database:** it is shared and at a clean baseline (users 0, profiles 0, official_actions 0, alerts 0, reports 0, pins 0, zones 4, centres 4 with 0 occupancy, municipalities 4, hazards 12, POIs 6). The only new rows it may end with are none; the live check deletes its test row. Never write alerts, pins or centre changes to zone-1..zone-4 outside the rolled-back suite.
- **Database suite:** there is no local Postgres. Use the Supabase MCP `execute_sql` / `apply_migration`. The suite is `helpers.sql` in one call, then `reference-tables.sql` + `rls.sql` concatenated in one call, and must reach `rollback;` with no TSTFL.
- **Privacy:** nothing reported may contain a query string, email, UUID, coordinates, token-like string, user id, IP, user agent, cookie or request body.
- **Copy:** user-facing strings are bilingual (`LocalizedText`, `t()`).
- **Gates:** all five exit 0 before each commit: `npm test`, `npm run typecheck`, `npm run lint`, `npm run knip`, `npm run build`. The baseline is 795 tests; the count never drops without naming each removed test.
- **Git:** stage named files only, never `git add .`. `.claude-sessions/` and `supabase/.temp/` stay untracked. Do not push, except the owner-approved push to `main` in Task 5.
- **Commit trailer**, after a blank line: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

### Task 1: The database side

**Files:**
- Create: `supabase/migrations/<timestamp>_app_errors.sql`. The timestamp must sort after `20260915075527_harden_appointment_and_action_grants.sql`.
- Modify: `supabase/tests/rls.sql` (append before the final `rollback;`), `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces:
  - `public.report_app_error(p_source text, p_kind text, p_message text, p_stack text, p_route text, p_environment text, p_release text, p_fingerprint text) returns void`
  - `public.recent_app_error_count() returns integer`

- [ ] **Step 1: Write the failing assertions.** Append to `rls.sql` before `rollback;`:

```sql
-- ===========================================================================
-- Monitoring: app_errors is written only through report_app_error, read by no
-- client, deduplicated, capped, and self-cleaning.
-- ===========================================================================
select tests.as_anon();
select tests.expect_denied('M1: anon cannot read app_errors', $$select * from public.app_errors$$);
select tests.expect_denied('M2: anon cannot insert app_errors directly',
  $$insert into public.app_errors (source, kind, message, route, environment, fingerprint)
    values ('client','unhandled','x','/','preview','f')$$);
select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_denied('M3: authenticated cannot delete app_errors', $$delete from public.app_errors$$);
select tests.expect_denied('M4: authenticated cannot update app_errors', $$update public.app_errors set message = 'x'$$);

select tests.as_anon();
select tests.expect_allowed('M5: anon can report an error',
  $$select public.report_app_error('client','unhandled','boom','at a (x.js:1:1)','/map','preview','abc123','fp-m5')$$);
select tests.expect_allowed('M6: a repeat within 5 minutes is accepted but not stored twice',
  $$select public.report_app_error('client','unhandled','boom','at a (x.js:1:1)','/map','preview','abc123','fp-m5')$$);

do $$
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  if (select count(*) from public.app_errors where fingerprint = 'fp-m5') <> 1 then
    raise exception using errcode = 'TSTFL', message = 'M6: duplicate fingerprint stored twice';
  end if;
end $$;

select tests.as_anon();
select tests.expect_allowed('M7: over-long input is truncated, not raised',
  $$select public.report_app_error('server','request', repeat('m', 900), repeat('s', 9000), repeat('/r', 300), 'production', repeat('z', 90), 'fp-m7')$$);

do $$
declare r record;
begin
  set local role postgres;
  select length(message) lm, length(stack) ls, length(route) lr, length(release) lrel into r
    from public.app_errors where fingerprint = 'fp-m7';
  if r.lm <> 500 or r.ls <> 4000 or r.lr <> 200 or r.lrel <> 64 then
    raise exception using errcode = 'TSTFL', message = format('M7: not truncated to limits: %s', r);
  end if;

  -- M8: rows older than 30 days are removed by the next report.
  insert into public.app_errors (occurred_at, source, kind, message, route, environment, fingerprint)
    values (now() - interval '31 days', 'client', 'unhandled', 'old', '/', 'preview', 'fp-old');
end $$;

select tests.as_anon();
select public.report_app_error('client','render','fresh', null,'/','preview', null,'fp-m8');

do $$
begin
  set local role postgres;
  if exists (select 1 from public.app_errors where fingerprint = 'fp-old') then
    raise exception using errcode = 'TSTFL', message = 'M8: 31-day-old row was not cleaned up';
  end if;

  -- M9: the hourly cap. Fill to 300 rows in the last hour, then one more must not store.
  insert into public.app_errors (source, kind, message, route, environment, fingerprint)
    select 'client','unhandled','fill','/','preview','fill-' || g from generate_series(1, 300) g;
end $$;

select tests.as_anon();
select public.report_app_error('client','unhandled','over cap', null,'/','preview', null,'fp-m9');

do $$
begin
  set local role postgres;
  if exists (select 1 from public.app_errors where fingerprint = 'fp-m9') then
    raise exception using errcode = 'TSTFL', message = 'M9: report stored beyond the hourly cap';
  end if;
end $$;

select tests.as_anon();
select tests.expect_row_count('M10: recent_app_error_count counts the last 15 minutes',
  $$select 1 where public.recent_app_error_count() >= 303$$, 1);
```

The function silently ignores an invalid `source`, `kind` or `environment` (it returns before inserting), and the table's CHECK constraints back that up for any future writer.

- [ ] **Step 2: Run the suite and confirm the failure.** It should fail at M1 with a relation that does not exist.

- [ ] **Step 3: Write and apply the migration** with `apply_migration`:

```sql
create table public.app_errors (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  source      text not null check (source in ('client','server')),
  kind        text not null check (kind in ('render','unhandled','request')),
  message     text not null check (char_length(message) <= 500),
  stack       text check (char_length(stack) <= 4000),
  route       text not null check (char_length(route) <= 200),
  environment text not null check (environment in ('production','preview')),
  release     text check (char_length(release) <= 64),
  fingerprint text not null check (char_length(fingerprint) <= 64)
);
create index app_errors_time on public.app_errors (occurred_at desc);
create index app_errors_fingerprint_time on public.app_errors (fingerprint, occurred_at desc);

alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

-- The only writer. Never raises at the caller: monitoring must not become a
-- second error. Dedupes, caps volume, and trims old rows as it goes.
create or replace function public.report_app_error(
  p_source text, p_kind text, p_message text, p_stack text,
  p_route text, p_environment text, p_release text, p_fingerprint text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.app_errors
   where id in (select id from public.app_errors
                 where occurred_at < now() - interval '30 days' limit 200);

  if p_source not in ('client','server')
     or p_kind not in ('render','unhandled','request')
     or p_environment not in ('production','preview')
     or coalesce(p_fingerprint, '') = '' then
    return;
  end if;

  if exists (select 1 from public.app_errors
              where fingerprint = left(p_fingerprint, 64)
                and occurred_at > now() - interval '5 minutes') then
    return;
  end if;

  if (select count(*) from public.app_errors where occurred_at > now() - interval '1 hour') >= 300 then
    return;
  end if;

  insert into public.app_errors (source, kind, message, stack, route, environment, release, fingerprint)
  values (p_source, p_kind, left(coalesce(p_message, ''), 500), left(p_stack, 4000),
          left(coalesce(p_route, '/'), 200), p_environment, left(p_release, 64), left(p_fingerprint, 64));
exception when others then
  return;
end;
$$;
revoke execute on function public.report_app_error(text,text,text,text,text,text,text,text) from public;
grant execute on function public.report_app_error(text,text,text,text,text,text,text,text) to anon, authenticated;

create or replace function public.recent_app_error_count() returns integer
language sql
security definer
set search_path = ''
stable
as $$ select count(*)::integer from public.app_errors where occurred_at > now() - interval '15 minutes' $$;
revoke execute on function public.recent_app_error_count() from public;
grant execute on function public.recent_app_error_count() to anon, authenticated;
```

Save the identical SQL as the migration file.

- [ ] **Step 4: Run the suite; it must pass. Then prove M6 and M9 bite.** One reversal at a time, each inside a `begin; … rollback;` via `execute_sql`, never altering the committed function:
  - redefine the function without the fingerprint check and confirm M6 raises;
  - redefine it without the cap and confirm M9 raises.

  Record both messages.

- [ ] **Step 5: Regenerate `database.types.ts`** (Supabase MCP `generate_typescript_types`, same formatting as the existing file). Run the five gates, then confirm the live baseline counts and that `select count(*) from public.app_errors` is 0.

- [ ] **Step 6: Commit** the migration file, `supabase/tests/rls.sql` and `src/lib/supabase/database.types.ts`, with the message `feat(monitoring): an app_errors log written only through a deduplicating, capped RPC`.

---

### Task 2: `scrub` and `reportError`

**Files:**
- Create: `src/lib/monitoring/scrub.ts`, `src/lib/monitoring/scrub.test.ts`, `src/lib/monitoring/report.ts`, `src/lib/monitoring/report.test.ts`

**Interfaces:**
- Consumes: the RPC `report_app_error` (Task 1); `readSupabaseEnv()` from `src/lib/supabase/env.ts`
- Produces:
  - `type ErrorSource = "client" | "server"`
  - `type ErrorKind = "render" | "unhandled" | "request"`
  - `interface ScrubbedReport { message: string; stack: string | null; route: string; fingerprint: string }`
  - `scrub(error: unknown, route: string): ScrubbedReport | null` (null means drop)
  - `monitoringEnvironment(): "production" | "preview" | null`
  - `reportError(error: unknown, opts: { source: ErrorSource; kind: ErrorKind; route: string }): Promise<void>`
  - `__resetReportCapForTests(): void`

- [ ] **Step 1: Write `scrub.test.ts`.**

```ts
import { describe, it, expect } from "vitest";
import { scrub } from "./scrub";

describe("scrub", () => {
  it("keeps only the path of a route — never a sign-in key or a next target", () => {
    expect(scrub(new Error("x"), "/auth/confirm?token_hash=abc123&type=email#frag")!.route).toBe("/auth/confirm");
    expect(scrub(new Error("x"), "https://weatherwell.test/sign-in?next=/admin")!.route).toBe("/sign-in");
  });

  it("redacts emails, UUIDs, coordinates and long tokens from message and stack", () => {
    const err = new Error(
      "user wilson@example.com id 098f16be-1691-4c94-a1cd-a3440bc9173f at 16.0288, 120.4366 key eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc"
    );
    err.stack = `Error: see wilson@example.com\n    at f (app.js:1:1) 16.08,120.40`;
    const r = scrub(err, "/")!;
    for (const text of [r.message, r.stack ?? ""]) {
      expect(text).not.toMatch(/wilson@example\.com/);
      expect(text).not.toMatch(/098f16be/);
      expect(text).not.toMatch(/16\.0288|120\.4366|16\.08,\s*120\.40/);
      expect(text).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
    }
    expect(r.message).toContain("[email]");
    expect(r.message).toContain("[id]");
    expect(r.message).toContain("[coords]");
    expect(r.message).toContain("[token]");
  });

  it.each([
    ["an RLS refusal", 'new row violates row-level security policy for table "alerts"'],
    ["a permission code", "42501: permission denied"],
    ["an out-of-area refusal", "not an official for this barangay"],
    ["an offline fetch", "Failed to fetch"],
    ["a network error", "NetworkError when attempting to fetch resource."],
    ["a Next redirect", "NEXT_REDIRECT"],
    ["a Next not-found", "NEXT_NOT_FOUND"],
  ])("drops %s", (_label, message) => {
    expect(scrub(new Error(message), "/")).toBeNull();
  });

  it("drops an AbortError by name", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    expect(scrub(err, "/")).toBeNull();
  });

  it("gives the same error the same fingerprint, and a different error a different one", () => {
    const a1 = new Error("Cannot read properties of undefined (reading 'flood')");
    a1.stack = "TypeError: x\n    at Panel (panel.js:10:5)\n    at other";
    const a2 = new Error("Cannot read properties of undefined (reading 'flood')");
    a2.stack = "TypeError: x\n    at Panel (panel.js:10:5)\n    at somewhere else";
    const b = new Error("Cannot read properties of undefined (reading 'landslide')");
    b.stack = a1.stack;
    expect(scrub(a1, "/")!.fingerprint).toBe(scrub(a2, "/")!.fingerprint);
    expect(scrub(a1, "/")!.fingerprint).not.toBe(scrub(b, "/")!.fingerprint);
    expect(scrub(a1, "/")!.fingerprint).toMatch(/^[0-9a-f]{8,64}$/);
  });

  it("handles non-Error throwables without throwing", () => {
    expect(scrub("plain string failure", "/")!.message).toBe("plain string failure");
    expect(scrub({ weird: true }, "/")!.message).toBe("[object Object]");
    expect(scrub(undefined, "/")!.message).toBe("undefined");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/lib/monitoring/scrub.test.ts` should fail because the module cannot be resolved.

- [ ] **Step 3: Implement `scrub.ts`.**

```ts
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
```

- [ ] **Step 4: Run the tests until they pass.** If one fails, fix the implementation, never the assertion.

- [ ] **Step 5: Write `report.test.ts`.**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportError, monitoringEnvironment, __resetReportCapForTests } from "./report";

const fetchMock = vi.fn();

beforeEach(() => {
  __resetReportCapForTests();
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "abc123");
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("reportError", () => {
  it("sends the scrubbed report to the RPC with the publishable key", async () => {
    await reportError(new Error("boom for wilson@example.com"), { source: "client", kind: "unhandled", route: "/map?x=1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proj.supabase.co/rest/v1/rpc/report_app_error");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.headers.apikey).toBe("sb_publishable_test");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ p_source: "client", p_kind: "unhandled", p_route: "/map", p_environment: "preview", p_release: "abc123" });
    expect(body.p_message).not.toContain("wilson@example.com");
    expect(JSON.stringify(body)).not.toMatch(/x=1/);
  });

  it("sends nothing in development", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "development");
    expect(monitoringEnvironment()).toBeNull();
    await reportError(new Error("boom"), { source: "client", kind: "unhandled", route: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the environment is unset (tests, local)", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    await reportError(new Error("boom"), { source: "client", kind: "unhandled", route: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing while the browser is offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await reportError(new Error("boom"), { source: "client", kind: "unhandled", route: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for an expected refusal", async () => {
    await reportError(new Error("not an official for this barangay"), { source: "client", kind: "unhandled", route: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops after 10 reports from one page load", async () => {
    for (let i = 0; i < 15; i++) {
      await reportError(new Error(`boom ${i}`), { source: "client", kind: "unhandled", route: "/" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("never throws when sending fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(reportError(new Error("boom"), { source: "client", kind: "unhandled", route: "/" })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Run it and confirm it fails** (the module is missing).

- [ ] **Step 7: Implement `report.ts`.**

```ts
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
```

`readSupabaseEnv()` throws when variables are missing, which is why it is not used here: reporting must never throw. The publishable key is sent as the bearer, so the call runs as `anon`. That is enough, because the RPC is granted to `anon`.

- [ ] **Step 8: Make every test pass, then run the five gates.** `knip` may flag `__resetReportCapForTests` as only used in tests; if it does, add it to the existing knip ignore pattern the repo uses for test helpers, or mark it the same way other test-only exports are handled (check `knip` config first).

- [ ] **Step 9: Commit** `src/lib/monitoring/*`, with the message `feat(monitoring): one scrubbing gate and one reporter for every error`.

---

### Task 3: Wire the browser, the error screens and the server

**Files:**
- Create: `src/features/monitoring/error-reporter.tsx` + `.test.tsx`, `src/app/global-error.tsx`, `src/app/global-error.test.tsx`, `src/instrumentation.ts` + `src/instrumentation.test.ts`
- Modify: `src/app/layout.tsx` (mount `<ErrorReporter />` beside `<AccountLink />`), `src/app/error.tsx`, plus a new `src/app/error.test.tsx`

**Interfaces:**
- Consumes: `reportError` (Task 2)
- Produces: `ErrorReporter(): null`; `onRequestError` (Next's `Instrumentation.onRequestError`)

- [ ] **Step 1: Read the docs.** Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` (`onRequestError`, its parameters and runtime notes) and `error.md` (props: this version names the recovery prop `retry` in `global-error`; check whether `error.tsx` still receives `reset` or `retry` and follow the doc, adjusting the existing file if it has changed).

- [ ] **Step 2: Write the failing tests.** Mock `@/lib/monitoring/report` in each:
  - **`error-reporter.test.tsx`:** render `<ErrorReporter />`.
    - Dispatch `new ErrorEvent("error", { error: new Error("boom") })` on `window` and expect `reportError` to be called with `{ source: "client", kind: "unhandled", route: location.pathname + location.search }`. `scrub` removes the query later.
    - Dispatch an `unhandledrejection` event (`new Event("unhandledrejection")` with a `reason` property defined on it) and expect a second call.
    - Unmount, dispatch again, and expect no further calls.
  - **`error.test.tsx`:** render `<Error error={Object.assign(new Error("render boom"), { digest: "d1" })} reset={() => {}} />` inside `renderWithData`. Expect `reportError` called exactly once with `kind: "render"`. Re-render with the same error object and expect still once.
  - **`global-error.test.tsx`:** render `<GlobalError error={new Error("layout boom")} retry={() => {}} />` (use the prop name the doc gives) and expect one `reportError` call with `kind: "render"`. Also expect both the English and Filipino messages in the document: it renders outside `LanguageProvider`, so it shows both.
  - **`instrumentation.test.ts`:** call `onRequestError(new Error("server boom"), { path: "/api/zones?x=1", method: "GET", headers: {} }, { routerKind: "App Router", routePath: "/api/zones", routeType: "route", renderSource: undefined, revalidateReason: undefined })` (shape per the doc; build it to satisfy the type). Expect `reportError` awaited with `{ source: "server", kind: "request", route: "/api/zones?x=1" }`.

- [ ] **Step 3: Run the tests and confirm each fails** (modules missing, or `reportError` not called).

- [ ] **Step 4: Implement.**

```tsx
// src/features/monitoring/error-reporter.tsx
"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring/report";

/** Reports crashes no error boundary sees: uncaught errors and rejected promises. */
export function ErrorReporter(): null {
  useEffect(() => {
    const route = () => window.location.pathname + window.location.search;
    const onError = (event: ErrorEvent) => void reportError(event.error ?? event.message, { source: "client", kind: "unhandled", route: route() });
    const onRejection = (event: PromiseRejectionEvent) => void reportError(event.reason, { source: "client", kind: "unhandled", route: route() });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
```

In `src/app/error.tsx`, add `useEffect(() => { void reportError(error, { source: "client", kind: "render", route: window.location.pathname }); }, [error]);`. Take `error` from props (it is currently unused), and keep the existing message and retry button unchanged.

```tsx
// src/app/global-error.tsx
"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring/report";

/**
 * Last resort, when the root layout itself fails. It replaces the whole
 * document, so it has no LanguageProvider and no global styles: it states the
 * message in both languages with inline styles.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    void reportError(error, { source: "client", kind: "render", route: window.location.pathname });
  }, [error]);
  return (
    <html lang="fil">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <p role="alert">Something went wrong loading WeatherWell. Please try again.</p>
        <p lang="fil">May naganap na problema sa pag-load ng WeatherWell. Pakisubukang muli.</p>
        <button type="button" onClick={retry} style={{ padding: "8px 16px", marginTop: 12 }}>
          Try again · Subukang muli
        </button>
      </body>
    </html>
  );
}
```

(Use the prop name `error.md` specifies.)

```ts
// src/instrumentation.ts
import type { Instrumentation } from "next";
import { reportError } from "@/lib/monitoring/report";

export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  await reportError(err, { source: "server", kind: "request", route: request.path });
};
```

Mount `<ErrorReporter />` in `src/app/layout.tsx` inside `LanguageProvider`, beside `<AccountLink />`.

- [ ] **Step 5: Run the tests, then the five gates.** `npm run build` is what proves `instrumentation.ts` and `global-error.tsx` are accepted by this Next version.

- [ ] **Step 6: Commit** the files above, with the message `feat(monitoring): report browser, error-screen and server crashes`.

---

### Task 4: `/api/health`

**Files:**
- Create: `src/app/api/health/route.ts`, `src/app/api/health/route.test.ts`
- Modify: `src/lib/service-worker.test.ts` (one added assertion)

**Interfaces:**
- Consumes: `createSupabaseServerClient()` (`src/lib/supabase/server.ts`); the RPC `recent_app_error_count` (Task 1)
- Produces: `GET /api/health`, returning `200 {status:"ok",database:"ok",recentErrors:number}` or `503 {status:"unavailable"}`, always `Cache-Control: no-store`

- [ ] **Step 1: Write `route.test.ts`.** Mock `@/lib/supabase/server` so that `createSupabaseServerClient()` returns `{ from, rpc }`. `from("zones").select("id").limit(1)` resolves to a configurable `{ data, error }`, and `rpc("recent_app_error_count")` resolves to a configurable `{ data, error }`. Cases:
  - both succeed with count 2: status 200, body `{ status: "ok", database: "ok", recentErrors: 2 }`, header `cache-control` contains `no-store`;
  - the zones read returns `{ error: { message: "db down: secret detail" } }`: status 503, body exactly `{ status: "unavailable" }`, and the raw text does not contain `secret detail`;
  - the zones read never resolves: use `vi.useFakeTimers()`, advance 5000 ms, and expect 503 `{ status: "unavailable" }`;
  - the count RPC errors while zones succeed: 200 with `recentErrors: 0`. Database reachability is what "up" means; a missing count must not page the owner as an outage.
  - the client factory throws (missing env): 503.

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Implement.**

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HEADERS = { "Cache-Control": "no-store" };
const TIMEOUT_MS = 5000;

function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
  ]);
}

/**
 * The monitor's one question: is the app running and can it reach its
 * database? Answers with a status and a count only — never an internal
 * message — because anyone can call it.
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await withTimeout(supabase.from("zones").select("id").limit(1));
    if (error) throw new Error("database");

    let recentErrors = 0;
    try {
      const count = await withTimeout(supabase.rpc("recent_app_error_count"));
      if (!count.error && typeof count.data === "number") recentErrors = count.data;
    } catch {
      // A missing count is not an outage.
    }

    return NextResponse.json({ status: "ok", database: "ok", recentErrors }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: HEADERS });
  }
}
```

- [ ] **Step 4: Add one assertion to `src/lib/service-worker.test.ts`,** using the file's existing `loadServiceWorker` harness: a GET fetch event for `/api/health` is answered from the network and nothing is written to any cache. `/api/health` is not in `PUBLIC_API_PATHS`, so the worker's existing rule already sends it network-only. This test pins that down; `sw.js` should need no change. If the test fails, change `sw.js` minimally and bump `VERSION`.

- [ ] **Step 5: Run the tests, then the five gates.**

- [ ] **Step 6: Commit** `src/app/api/health/*` and `src/lib/service-worker.test.ts`, with the message `feat(monitoring): a health endpoint that checks the database and counts recent crashes`.

---

### Task 5: The watcher, disclosure and PRD

**Files:**
- Create: `scripts/check-health.mjs`, `scripts/check-health.test.ts`, `.github/workflows/monitor.yml`
- Modify: `src/features/onboarding/consent-notice.tsx` (+ its test if one exists), `PRD.md`
- On `main` only (Step 7): `.github/workflows/monitor.yml`, `scripts/check-health.mjs`, `vercel.json`

**Interfaces:**
- Consumes: `GET /api/health` (Task 4)
- Produces: `checkHealth({ healthUrl, homeUrl, fetchImpl, retryDelayMs }): Promise<{ ok: boolean; lines: string[] }>` exported from `scripts/check-health.mjs`; the CLI exits 1 when `ok` is false.

- [ ] **Step 1: Write `scripts/check-health.test.ts`.** Pass a fake `fetchImpl` and `retryDelayMs: 0`. Cases:
  - health 200 `{recentErrors:0}` and home 200: `ok` true;
  - health 200 `{recentErrors:3}`: `ok` false, and `lines` includes `new crashes in the last 15 minutes: 3`;
  - health 503 twice: `ok` false, and `lines` includes `health check failed: HTTP 503`;
  - health 503 then 200: `ok` true (one retry);
  - health fetch rejects twice: `ok` false with `health check failed: unreachable`;
  - home 500: `ok` false with `production homepage failed: HTTP 500`;
  - no line ever contains a response body other than the count.

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Implement `scripts/check-health.mjs`.**

```js
/**
 * Used by .github/workflows/monitor.yml. A non-zero exit fails the scheduled
 * run, and GitHub emails the repository owner — that email is the alert.
 * Prints which check failed and a count; never an error's contents.
 */
export async function checkHealth({ healthUrl, homeUrl, fetchImpl = fetch, retryDelayMs = 30_000 }) {
  const lines = [];
  let ok = true;

  async function getHealth() {
    try {
      const res = await fetchImpl(healthUrl, { cache: "no-store" });
      if (res.status !== 200) return { failure: `health check failed: HTTP ${res.status}` };
      const body = await res.json();
      return { recentErrors: Number(body.recentErrors) || 0 };
    } catch {
      return { failure: "health check failed: unreachable" };
    }
  }

  let health = await getHealth();
  if (health.failure) {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    health = await getHealth();
  }
  if (health.failure) {
    ok = false;
    lines.push(health.failure);
  } else if (health.recentErrors > 0) {
    ok = false;
    lines.push(`new crashes in the last 15 minutes: ${health.recentErrors}`);
  } else {
    lines.push("health ok");
  }

  try {
    const home = await fetchImpl(homeUrl, { cache: "no-store" });
    if (home.status !== 200) {
      ok = false;
      lines.push(`production homepage failed: HTTP ${home.status}`);
    } else {
      lines.push("production homepage ok");
    }
  } catch {
    ok = false;
    lines.push("production homepage failed: unreachable");
  }

  return { ok, lines };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("check-health.mjs")) {
  const { ok, lines } = await checkHealth({ healthUrl: process.env.HEALTH_URL, homeUrl: process.env.HOME_URL });
  for (const line of lines) console.log(line);
  process.exit(ok ? 0 : 1);
}
```

Make sure importing the module in the test does not run the CLI block. If the `argv` check misfires under Vitest, guard it with `process.env.VITEST !== "true"` instead. If the test runner or `knip` does not pick up `scripts/*.mjs`, check how `scripts/generate-seed.test.ts` is configured and follow that.

- [ ] **Step 4: Create `.github/workflows/monitor.yml`.**

```yaml
name: Monitor

on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:

# A failed scheduled run emails the repository owner. That email is the alert.
env:
  HEALTH_URL: https://weatherwell-git-v0-wilsondayritjrapex-5422s-projects.vercel.app/api/health
  HOME_URL: https://weatherwell-wilsondayritjrapex-5422s-projects.vercel.app/

concurrency:
  group: monitor
  cancel-in-progress: false

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v5
        with:
          sparse-checkout: scripts
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - run: node scripts/check-health.mjs
```

- [ ] **Step 5: Consent disclosure.** Add to `CONSENT_COPY` in `src/features/onboarding/consent-notice.tsx`:

```ts
  errors: {
    en: "If the app crashes, an anonymous error report — with no name, location or account — is sent so it can be fixed.",
    fil: "Kung ma-crash ang app, isang hindi nagpapakilalang ulat ng error — walang pangalan, lokasyon, o account — ay ipinapadala upang maisaayos ito.",
  },
```

Render it as `<p>{t(CONSENT_COPY.errors, lang)}</p>` directly after the phone paragraph. If a consent-notice test exists, add one assertion per language that the sentence renders.

- [ ] **Step 6: Update `PRD.md`.**
  - **Build Status:** change the "Error / uptime monitoring" row to **Built**, with a note: crashes are saved scrubbed to `app_errors` (read in Supabase → Table Editor); `/api/health`; the GitHub `Monitor` workflow every 15 minutes emails the owner on failure or new crashes; GitHub may delay runs and pauses schedules after 60 days of repository inactivity (re-enable in the Actions tab); the log can be flooded to its 300/hour cap.
  - **Privacy & Data:** add a retention row: `app_errors`, 30 days, scrubbed crash reports with no personal data.
  - **Setup:** add a note that monitoring needs no setup, and that the GitHub notification email for failed workflow runs must stay on (GitHub → Settings → Notifications → Actions, which is on by default).

- [ ] **Step 7: Run the tests and five gates, then commit on `v0`** `scripts/check-health.mjs`, `scripts/check-health.test.ts`, `.github/workflows/monitor.yml`, `src/features/onboarding/consent-notice.tsx` (plus its test if changed) and `PRD.md`, with the message `feat(monitoring): a scheduled health watcher, the consent disclosure and the PRD`.

- [ ] **Step 8: Stop and get the owner's OK to push to `main`.** Then, in a separate worktree, create a `main` commit containing only `.github/workflows/monitor.yml`, `scripts/check-health.mjs`, and `vercel.json` with this content:

```json
{ "git": { "deploymentEnabled": { "main": false } } }
```

Do not check out `main` in the primary working tree. Push `main`, remove the worktree, and confirm in the Vercel project's deployments that no `main` deployment was created.

---

### Task 6: Live verification

- [ ] **Step 1: Push `v0`** (owner-authorised in the same request as Step 8 of Task 5) and wait for the preview deployment to serve `/api/health`.
- [ ] **Step 2: Check the health endpoint.** `curl` the preview's `/api/health` should return 200, `recentErrors: 0` and `cache-control: no-store`.
- [ ] **Step 3: Send a test report.** Call the RPC directly as `anon` with a clearly labelled test report (`p_message: 'live monitoring test'`, `p_route: '/test?token_hash=should-not-appear'` pre-scrubbed to `/test`, `p_environment: 'preview'`). Then `select * from public.app_errors`: exactly one row, with no query string and no personal data.
- [ ] **Step 4: Check the browser path end to end** in the preview:
  1. In the page context, run `window.dispatchEvent(new ErrorEvent('error', { error: new Error('live monitoring browser test for someone@example.com') }))`.
  2. Confirm a second row whose message has `[email]` instead of the address and whose environment is `preview`.
  3. If the row is absent, check whether `NEXT_PUBLIC_VERCEL_ENV` reached the client bundle (a spec known limit). Report it; do not work around it silently.
- [ ] **Step 5: See the watcher fail.** `/api/health` now shows `recentErrors` ≥ 1. Trigger `Monitor` manually (`gh workflow run monitor.yml` if `gh` works, otherwise ask the owner to press "Run workflow" in the Actions tab) and confirm the run fails with `new crashes in the last 15 minutes`.
- [ ] **Step 6: See it pass.** Delete the test rows (`delete from public.app_errors where message like 'live monitoring%'`), confirm `select count(*) from public.app_errors` is 0, trigger the workflow again, and confirm it passes.
- [ ] **Step 7: Confirm the live baseline counts are unchanged, then report every step's outcome.**
