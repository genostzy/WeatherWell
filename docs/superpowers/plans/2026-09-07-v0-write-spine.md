# v0 Write Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give WeatherWell a real write path — a resident's water-level report reaching Postgres, attributed to a genuine authenticated principal, and surviving the network being gone.

**Architecture:** Identity comes from Supabase anonymous auth held in cookies, so Server Actions and route handlers can act as the resident. Every mutation goes through an outbox: applied optimistically, queued locally, and replayed when a session and a network exist. The row's primary key is generated on the client, which is what makes replay idempotent — a queued write that actually landed before the connection dropped conflicts on insert instead of duplicating.

**Tech Stack:** `@supabase/ssr` (cookie sessions), Next.js 16 **Proxy** (`src/proxy.ts` — the `middleware` convention is deprecated and renamed in this version; verified in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`), Server Actions, Supabase project `keoxneujsebuedqbmqxz`.

**Spec:** [docs/superpowers/specs/2026-09-05-v0-supabase-data-layer-design.md](../specs/2026-09-05-v0-supabase-data-layer-design.md)

**Predecessors, both complete:** [Plan 1 — database foundation](2026-09-05-v0-database-foundation.md) (ten tables, RLS, 30 denial assertions). [Plan 2 — read path](2026-09-07-v0-read-path-migration.md) (zones, centres, POIs, hazards and alerts all read from Postgres; app verified working offline).

---

## BLOCKER — this plan cannot execute until you flip one switch

**Anonymous sign-ins are disabled.** Verified just now against the live project:

```
POST /auth/v1/signup  →  HTTP 422
{"code":422,"error_code":"anonymous_provider_disabled","msg":"Anonymous sign-ins are disabled"}
```

Enable at: Supabase dashboard → **Authentication → Sign In / Providers → Anonymous sign-ins → on**.

Task 2 fails immediately without it, and every task after depends on Task 2. Re-run the curl in Task 2 Step 1 to confirm before starting.

---

## Scope: this is plan 3 of 5

**In: the write spine.** Cookie-based sessions, anonymous identity, the outbox, one Server Action proven end to end (`submitWaterLevelReport`), `/api/reports`, and migrating `water-level-reports.ts`.

**Out, deliberately:**

| Deferred to | What |
|---|---|
| **Plan 4** | The remaining four stores — pins, pin votes, check-ins, zone overrides. `/api/pins`, `/api/check-ins` (with `no-store` and its `sw.js` branch). The `zone-overrides.ts` collapse onto database alerts. Layer 9 re-pointed at `superseded_severity`. Deleting `device-id.ts`. |
| **Plan 5** | Operator PIN gate, CI database wiring, error/uptime monitoring — the rest of Stage 2's exit criteria. |

**Why water-level reports first.** It is the simplest write in the product — an insert with no update, no moderation, no vote tally — so the outbox's design gets proven on the least confounded case. It is also the mechanism the challenge's third clause rests on: the community standing in for sensors nobody can afford. Once this path works, the other four stores are the same shape and can be batched.

## Inherited from Plan 2's final review — a required item, not a note

**A stale `localStorage` override silently suppresses a newer database alert.** `zone-overrides.ts` stores an override keyed only by zone id, with no alert id or timestamp. Once alerts exist in Postgres, an operator who cleared zone-2 on Monday still sees zone-2 as Safe on Tuesday when a new `red` alert lands — while residents see the real alert. The one person who can act is shown the wrong answer.

The window was zero while nothing wrote alerts. **This plan does not write alerts either**, so it stays zero here. **Plan 4 must close it** as part of the `zone-overrides` collapse, and must not be considered complete until it does.

## Global Constraints

- **Project:** `keoxneujsebuedqbmqxz`. Never target another.
- **Never import a secret or service-role key into anything under `src/`.** The publishable key plus the user's cookie session is the only credential. `readSupabaseEnv` already rejects a secret key in a `NEXT_PUBLIC_` variable, including a real service-role JWT.
- **Never trust `supabase.auth.getSession()` in server code.** It does not revalidate the token. Use `supabase.auth.getClaims()`, which verifies the JWT signature against the project's published keys. This is the single most important rule in this plan.
- **Do not run code between `createServerClient` and `supabase.auth.getClaims()` in the proxy.** Supabase's own guidance: a mistake there causes users to be randomly logged out and is very hard to debug.
- **`setAll` receives `(cookiesToSet, headers)`.** The second argument carries `Cache-Control`/`Expires`/`Pragma` that MUST be applied to the response — without them a CDN can cache a response containing one resident's session and serve it to another.
- **Every write goes through a Server Action**, never straight from the browser to Supabase. That is where validation lives, and it is where Stage 3's geofence and rate limit will slot in.
- **Anonymous users carry the `authenticated` Postgres role.** `TO authenticated` includes them by design. Never use `auth.role()`.
- **Every user-facing string is `LocalizedText` rendered with `t(text, lang)`.** Queue and failure states are user-facing.
- **250 KB first-load budget.** `@supabase/ssr` reaches the client (the browser client needs it); keep an eye on the build output and report the delta.
- **`src/lib/types.ts` does not change.**
- **Existing gates stay green:** `npm run lint`, `npm run typecheck`, `npx vitest run`, `npx knip`, `npm run build`. Baseline is **411 tests across 71 files**.
- **Regenerate `src/lib/supabase/database.types.ts` after any migration** and say so in the report.

---

## Staying on the free tier

The Supabase organisation is on the **Free** plan and the Vercel deployment on **Hobby**. Neither has a card on file, so nothing here can generate a bill — exceeding a limit throttles or pauses the project rather than charging for it. Keeping it that way is a design constraint, not an afterthought:

- **`auth.users` rows are permanent and count toward the free tier's monthly-active-user allowance.** Nothing reaps them. This is why sign-in is deferred to the first write (Task 2 Step 6) rather than happening on page load. A change that signs users in earlier is a change to the bill.
- **`trust_weight` and `is_outlier` stay server-controlled** — unrelated to cost, but the same column-grant discipline that protects them is what keeps a client from writing arbitrary volume into columns nobody validates.
- **The database is 11 MB of a 500 MB allowance** with zero rows of real data. Reports and pins are a few hundred bytes each; this is not the constraint to worry about.
- **A free project pauses after about a week with no activity.** That costs nothing, and unpausing is a click — but a paused backend means a cold visitor hits the reference-data gate's failure card. Worth knowing before showing the deployed app to anyone after a quiet stretch.
- **No Supabase branches.** `create_branch` bills per branch; this plan uses none, and none should be created to work around a migration problem.

---

## Two client factories, and which is which

`src/lib/supabase/server.ts` already exports `createSupabaseServerClient()` — no session, publishable key, used by `/api/zones` and `/api/alerts` for data that is world-readable under `select using (true)`. **It stays exactly as it is.** Public reads should not depend on a session.

This plan adds a second, cookie-aware factory for anything that must act *as the resident*. Their doc comments must make the choice unmistakable, because picking the wrong one fails in opposite directions: the public client on a user write fails loudly at RLS, while the user client on a public read works but needlessly couples a cacheable response to a session.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/supabase/browser.ts` | `createBrowserClient` singleton for the browser. |
| `src/lib/supabase/user-server.ts` | `createSupabaseUserClient()` — cookie-aware, acts as the resident. Server Actions and user-scoped routes. |
| `src/lib/supabase/proxy-session.ts` | `updateSession(request)` — refreshes the auth token on every request. |
| `src/proxy.ts` | Next's Proxy entry point. Delegates to `updateSession`. |
| `src/lib/auth/anonymous-session.ts` | `ensureAnonymousSession()`, `useSessionUserId()`. |
| `src/lib/outbox/types.ts` | `OutboxEntry`, the operation union. |
| `src/lib/outbox/outbox.ts` | The queue: `enqueue`, `markDelivered`, `markFailed`, `useOutbox`. |
| `src/lib/outbox/drain.ts` | `drainOutbox(dispatch)` — replay, with transient/permanent failure handling. |
| `src/lib/outbox/use-outbox-drain.ts` | Mount-once hook: drains on load and on `online`. |
| `src/app/actions/submit-water-level-report.ts` | The Server Action. |
| `src/app/api/reports/route.ts` | `GET` recent reports per zone. |
| `src/lib/water-level-reports.ts` | Rewritten: server rows merged with pending outbox entries. |
| `supabase/migrations/<ts>_report_client_ids.sql` | Grants `id` on insert so client-generated keys work. |

---

### Task 1: Cookie sessions and the Proxy

Nothing user-visible. This is the plumbing that lets a Server Action act as the resident instead of as nobody.

**Files:**
- Create: `src/lib/supabase/browser.ts`, `src/lib/supabase/user-server.ts`, `src/lib/supabase/proxy-session.ts`, `src/proxy.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `readSupabaseEnv()` from `src/lib/supabase/env.ts`
- Produces: `getBrowserClient(): SupabaseClient<Database>`, `createSupabaseUserClient(): Promise<SupabaseClient<Database>>`, `updateSession(request: NextRequest): Promise<NextResponse>`

- [ ] **Step 1: Install the package**

```bash
npm install @supabase/ssr
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/supabase/browser.test.ts`. The singleton property is what matters — `createBrowserClient` is documented as already singleton-ing internally, and a second client would mean a second session listener racing the first:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => ({ marker: Math.random() })),
}));

import { createBrowserClient } from "@supabase/ssr";
import { getBrowserClient } from "./browser";

describe("getBrowserClient", () => {
  beforeEach(() => {
    vi.mocked(createBrowserClient).mockClear();
  });

  it("returns the same client on repeated calls", () => {
    // Two clients means two auth listeners racing to refresh the same token,
    // which is how a resident gets silently signed out mid-report.
    expect(getBrowserClient()).toBe(getBrowserClient());
  });

  it("constructs the underlying client only once", () => {
    getBrowserClient();
    getBrowserClient();
    expect(createBrowserClient).toHaveBeenCalledTimes(0);
  });
});
```

Note the second expectation is `0` because the first test already constructed it at module scope — if your implementation constructs lazily on first call, the count across the file is 1. **Run it and use the real number**; do not force the source to match a guess.

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run src/lib/supabase/browser.test.ts
```
Expected: FAIL — cannot resolve `./browser`.

- [ ] **Step 4: Write the browser client**

Create `src/lib/supabase/browser.ts`:

```ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./env";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | null = null;

/**
 * The browser's Supabase client. Sessions live in cookies rather than
 * localStorage, which is what lets a Server Action read the same session and
 * act as this resident — a token the server cannot see is a token that cannot
 * satisfy an RLS policy.
 *
 * Memoised: a second client means a second auth listener racing the first to
 * refresh the same token.
 */
export function getBrowserClient(): SupabaseClient<Database> {
  if (!client) {
    const { url, publishableKey } = readSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    client = createBrowserClient<Database>(url, publishableKey);
  }
  return client;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/supabase/browser.test.ts
```
Expected: PASS. Correct the call-count expectation to whatever the real number is, and say in your report which it was and why.

- [ ] **Step 6: Write the user-scoped server client**

Create `src/lib/supabase/user-server.ts`:

```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./env";
import type { Database } from "./database.types";

/**
 * A Supabase client that acts AS THE SIGNED-IN RESIDENT, for Server Actions
 * and any route that reads user-scoped rows.
 *
 * Use `createSupabaseServerClient()` from ./server instead for data that is
 * world-readable under `select using (true)` — zones, alerts, pins. Choosing
 * wrong fails in opposite directions: the public client on a user write is
 * refused loudly by RLS, while this one on a public read works but couples a
 * cacheable response to a session.
 */
export async function createSupabaseUserClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const { url, publishableKey } = readSupabaseEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which cannot write cookies. Safe
          // to ignore: the Proxy refreshes the session on every request.
        }
      },
    },
  });
}
```

- [ ] **Step 7: Write the session refresher and the Proxy**

Create `src/lib/supabase/proxy-session.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabaseEnv } from "./env";
import type { Database } from "./database.types";

/**
 * Refreshes the auth token on every request and hands the new one to both the
 * server and the browser. Without this, a resident's session expires mid-storm
 * and their queued reports stop being attributable.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = readSupabaseEnv();

  // Created per request on purpose — never hoisted to a module global, which
  // under Fluid compute would share one resident's client with another.
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Cache-Control / Expires / Pragma. Without these a CDN can cache a
        // response carrying one resident's session and serve it to another.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Nothing may run between createServerClient and getClaims(). getClaims
  // verifies the JWT signature against the project's published keys;
  // getSession() does not revalidate and must never be trusted server-side.
  await supabase.auth.getClaims();

  return response;
}
```

Create `src/proxy.ts` — **`proxy`, not `middleware`: that convention is deprecated and renamed in this version of Next**, and the file sits beside `app/`, so inside `src/`:

```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Static assets and images never carry a session, so refreshing on them is
  // pure latency on the degraded connections this app is built for.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 8: Verify the Proxy actually runs and sets no session for a visitor with none**

```bash
npm run dev
```
```bash
curl -s -D - -o /dev/null http://localhost:3000/ | grep -i "set-cookie\|cache-control" || echo "(no session cookie — correct, nobody has signed in yet)"
curl -s -o /dev/null -w "sw.js: HTTP %{http_code}\n" http://localhost:3000/sw.js
```
Expected: the page loads, no `sb-` cookie yet (Task 2 creates the session), and `sw.js` still serves 200 — confirming the matcher exempts it. Stop the dev server.

- [ ] **Step 9: Run all gates and commit**

```bash
npm run lint && npm run typecheck && npx vitest run && npx knip && npm run build
```
`knip` may flag the new files as unused until later tasks import them. If so, note which — **do not add them to `entry`**; Task 2 imports `browser.ts` and `anonymous-session.ts`, Task 4 imports `user-server.ts`. If knip still complains after this task, report it rather than suppressing.

```bash
git add src/lib/supabase src/proxy.ts package.json package-lock.json
git commit -m "feat(auth): hold Supabase sessions in cookies so the server can act as the resident"
```

---

### Task 2: Anonymous identity

The moment `auth.uid()` becomes real. Every RLS policy written in Plan 1 keys off it, and until now nothing has ever produced one.

**Files:**
- Create: `src/lib/auth/anonymous-session.ts`, `src/lib/auth/anonymous-session.test.ts`
- Modify: `src/lib/reference-data/provider.tsx`

**Interfaces:**
- Consumes: `getBrowserClient()` from Task 1
- Produces: `ensureAnonymousSession(): Promise<string | null>` — resolves to the user id, or `null` when no session could be obtained. `useSessionUserId(): string | null`

- [ ] **Step 1: Confirm the blocker is cleared**

```bash
KEY=$(grep NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY .env.local | cut -d= -f2-)
curl -s -X POST "https://keoxneujsebuedqbmqxz.supabase.co/auth/v1/signup" \
  -H "apikey: $KEY" -H "Content-Type: application/json" -d '{}' | head -c 300; echo
```
Expected: JSON containing an `access_token` and a `user` with `"is_anonymous": true`.

**If it returns `{"code":422,"error_code":"anonymous_provider_disabled"}`, STOP and report BLOCKED.** Anonymous sign-ins must be enabled in the Supabase dashboard (Authentication → Sign In / Providers). Nothing in this plan works without it and no amount of code will route around it.

- [ ] **Step 2: Write the failing test**

Create `src/lib/auth/anonymous-session.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const signInAnonymously = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ auth: { getSession, signInAnonymously } }),
}));

import { ensureAnonymousSession } from "./anonymous-session";

beforeEach(() => {
  getSession.mockReset();
  signInAnonymously.mockReset();
});

describe("ensureAnonymousSession", () => {
  it("reuses an existing session rather than creating a second identity", async () => {
    // A resident who signs in twice becomes two people: their earlier reports
    // and pins stop being theirs.
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });

    await expect(ensureAnonymousSession()).resolves.toBe("user-1");
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });

    await expect(ensureAnonymousSession()).resolves.toBe("user-2");
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });

  it("returns null instead of throwing when sign-in fails", async () => {
    // Offline first-run. The app must still render and still queue writes —
    // attribution happens at replay, not here.
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({
      data: { user: null },
      error: { message: "network" },
    });

    await expect(ensureAnonymousSession()).resolves.toBeNull();
  });

  it("does not start two sign-ins when called concurrently", async () => {
    // Two callers on first paint would create two anonymous users and leave
    // one orphaned, along with whatever it was attributed.
    getSession.mockResolvedValue({ data: { session: null } });
    let resolveSignIn: (v: unknown) => void = () => {};
    signInAnonymously.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      })
    );

    const both = Promise.all([ensureAnonymousSession(), ensureAnonymousSession()]);
    resolveSignIn({ data: { user: { id: "user-3" } }, error: null });

    expect(await both).toEqual(["user-3", "user-3"]);
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run src/lib/auth/anonymous-session.test.ts
```
Expected: FAIL — cannot resolve `./anonymous-session`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/auth/anonymous-session.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * In-flight sign-in, shared by concurrent callers. Two sign-ins on first paint
 * would create two anonymous users and orphan one of them along with anything
 * attributed to it.
 */
let inFlight: Promise<string | null> | null = null;

/**
 * The resident's user id, signing in anonymously the first time.
 *
 * Anonymous auth is what makes `auth.uid()` real, and every RLS policy in this
 * database keys off it. It replaces the random client-generated device id the
 * prototype used: this identity is issued and verified by the server, which is
 * what anti-abuse layer 5 always claimed and could not previously deliver.
 *
 * Returns null rather than throwing when there is no network. That is not a
 * failure state — the outbox queues writes without an identity and attributes
 * them at replay, because a resident with no signal still has something to say.
 */
export async function ensureAnonymousSession(): Promise<string | null> {
  const supabase = getBrowserClient();

  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.id) return data.session.user.id;

  if (!inFlight) {
    inFlight = supabase.auth
      .signInAnonymously()
      .then(({ data: signedIn, error }) => (error ? null : (signedIn.user?.id ?? null)))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** The resident's user id once known, or null while signing in or offline. */
export function useSessionUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void ensureAnonymousSession().then((id) => {
      if (active) setUserId(id);
    });
    return () => {
      active = false;
    };
  }, []);

  return userId;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/auth/anonymous-session.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 6: Do NOT sign anyone in on page load**

There is nothing to do in this step except understand why it is empty, because the obvious implementation is wrong in two ways at once.

**Do not call `ensureAnonymousSession()` from `provider.tsx`, from `layout.tsx`, or from anything that runs on mount.** Sign-in happens on the first *write*, and nowhere else — Task 5 wires it to exactly two places: `addWaterLevelReport`, and the outbox drain when the queue is non-empty.

Two reasons, and the second is the one that bites:

1. **Reads are public.** Zones, alerts, centres, POIs, hazards all carry `select using (true)`. A resident who only looks at their zone needs no identity, and creating one adds a network round trip to first paint on exactly the degraded connections this app is built for.

2. **Every anonymous sign-in is a permanent row in `auth.users` that counts toward the Supabase free tier's monthly-active-user allowance, and nothing reaps it.** Signing in on page load means every casual visitor, every judge opening the link, every crawler and every fresh browser profile becomes a user forever. Signing in on first write means only people who actually contribute do. The difference is roughly two orders of magnitude, and it is the single decision in this plan with a real bill attached.

This also makes the privacy story truthful rather than merely defensible: the app does not manufacture an identity for someone who only read.

- [ ] **Step 7: Verify a real anonymous user and profile appear**

```bash
npm run dev
```
Load `http://localhost:3000` in a browser with no prior session. Then:

Load the Supabase MCP tools with ONE ToolSearch call — `select:mcp__supabase__execute_sql` (**no `project_id` parameter**) — and run:

```sql
select u.id, u.is_anonymous, p.role, p.created_at
from auth.users u join public.profiles p on p.id = u.id
order by u.created_at desc limit 3;
```

Expected: at least one row, `is_anonymous = true`, `role = 'resident'`. **The profile row proves Plan 1's `on_auth_user_created` trigger fires for anonymous users**, which nothing has exercised until now. If the user exists but the profile does not, stop and report it — every operator check depends on that trigger.

Stop the dev server.

- [ ] **Step 8: Run all gates and commit**

```bash
npm run lint && npm run typecheck && npx vitest run && npx knip && npm run build
git add src/lib/auth src/lib/reference-data/provider.tsx
git commit -m "feat(auth): sign residents in anonymously so auth.uid() is real"
```

---

### Task 3: The outbox

Pure logic, no network, no server. Everything here is unit-testable, which is the point: the queue is the part that must not lose a resident's report, and it should be provable without a database.

**Files:**
- Create: `src/lib/outbox/types.ts`, `src/lib/outbox/outbox.ts`, `src/lib/outbox/outbox.test.ts`, `src/lib/outbox/drain.ts`, `src/lib/outbox/drain.test.ts`

**Interfaces:**
- Consumes: `createLocalStorageStore` from `src/lib/local-storage-store.ts`
- Produces: `OutboxEntry`, `enqueue(operation, payload): OutboxEntry`, `useOutbox(): OutboxEntry[]`, `markDelivered(id)`, `markFailed(id, error, permanent)`, `drainOutbox(dispatch): Promise<DrainResult>`

**A deliberate departure from the spec.** The spec says the outbox lives in IndexedDB. This plan uses `localStorage` through the existing `createLocalStorageStore`, because entries are a few hundred bytes of JSON, that abstraction is already written and tested, and IndexedDB's async API would make every call site async for no benefit at this size. When queued pin *photos* arrive — a decision the spec itself defers — that is when IndexedDB earns its place. Record this in the report so a reviewer weighs it rather than discovering it.

- [ ] **Step 1: Write the failing test for the queue**

Create `src/lib/outbox/outbox.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, readOutbox, markDelivered, markFailed } from "./outbox";

beforeEach(() => {
  localStorage.clear();
});

describe("outbox", () => {
  it("assigns each entry an id, which becomes the database row's key", () => {
    // Client-generated keys are what make replay idempotent: a queued write
    // that actually landed before the connection dropped conflicts on insert
    // instead of creating a second report.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("survives a reload", () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    expect(readOutbox()).toHaveLength(1);
  });

  it("removes an entry once delivered", () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    markDelivered(entry.id);
    expect(readOutbox()).toHaveLength(0);
  });

  it("keeps a failed entry and records why, rather than dropping it", () => {
    // The spec is explicit: never drop silently. A resident's report is the
    // only evidence that a street is flooding.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    markFailed(entry.id, "network", false);

    const [stored] = readOutbox();
    expect(stored.attempts).toBe(1);
    expect(stored.lastError).toBe("network");
    expect(stored.permanentlyFailed).toBe(false);
  });

  it("marks a permanent failure so it stops being retried but stays visible", () => {
    // An RLS denial will never succeed on retry. Hammering it wastes a
    // degraded connection, but deleting it hides that something went wrong.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    markFailed(entry.id, "row-level security", true);

    expect(readOutbox()[0].permanentlyFailed).toBe(true);
  });

  it("preserves order, so reports replay in the order they were made", () => {
    const first = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "ankle" });
    const second = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    expect(readOutbox().map((e) => e.id)).toEqual([first.id, second.id]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/outbox/outbox.test.ts
```
Expected: FAIL — cannot resolve `./outbox`.

- [ ] **Step 3: Write the types and the queue**

Create `src/lib/outbox/types.ts`:

```ts
import type { DepthLevel } from "@/lib/depth";

/** Widened in the next plan as pins, votes, check-ins and overrides migrate. */
export type OutboxOperation = "submitWaterLevelReport";

export interface OutboxPayloads {
  submitWaterLevelReport: { zoneId: string; depthLevel: DepthLevel };
}

export interface OutboxEntry {
  /**
   * Generated on the client and used as the database row's primary key. This
   * is what makes replay idempotent — a re-sent entry conflicts on insert
   * rather than creating a duplicate report.
   */
  id: string;
  operation: OutboxOperation;
  payload: OutboxPayloads[OutboxOperation];
  queuedAt: string;
  attempts: number;
  lastError?: string;
  /** True when retrying cannot help — an RLS denial, a validation rejection. */
  permanentlyFailed: boolean;
}
```

Create `src/lib/outbox/outbox.ts`:

```ts
"use client";

import { createLocalStorageStore } from "@/lib/local-storage-store";
import type { OutboxEntry, OutboxOperation, OutboxPayloads } from "./types";

const EMPTY: OutboxEntry[] = [];

const store = createLocalStorageStore<OutboxEntry[]>(
  "weatherwell.outbox",
  "weatherwell:outbox-changed",
  EMPTY
);

/** Every queued write, oldest first. Re-renders when the queue changes. */
export function useOutbox(): OutboxEntry[] {
  return store.useStore();
}

/**
 * Non-reactive read, for the drain loop and for tests. `getSnapshot` is the
 * store's existing non-reactive accessor — the drain runs outside React and
 * cannot call a hook.
 */
export function readOutbox(): OutboxEntry[] {
  return store.getSnapshot();
}

export function enqueue<K extends OutboxOperation>(
  operation: K,
  payload: OutboxPayloads[K]
): OutboxEntry {
  const entry: OutboxEntry = {
    id: crypto.randomUUID(),
    operation,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    permanentlyFailed: false,
  };
  store.update((all) => [...all, entry]);
  return entry;
}

/** The write landed. Drop it — the server row is the record now. */
export function markDelivered(id: string): void {
  store.update((all) => all.filter((entry) => entry.id !== id));
}

/**
 * The write did not land. The entry stays: a resident's report is the only
 * evidence that a street is flooding, and losing it silently is worse than
 * showing it as unsent.
 */
export function markFailed(id: string, error: string, permanent: boolean): void {
  store.update((all) =>
    all.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            attempts: entry.attempts + 1,
            lastError: error,
            permanentlyFailed: permanent,
          }
        : entry
    )
  );
}
```

**`createLocalStorageStore` already exposes what you need.** It returns `{ useStore, getSnapshot, write, update, subscribe }` — `getSnapshot` is the non-reactive accessor, which is what the drain loop needs since it runs outside React and cannot call a hook. **Do not add a `read()` alias**, and do not read `localStorage` directly here; that would bypass the store's parse-and-cache handling and its same-tab change event.

- [ ] **Step 4: Run the queue tests to verify they pass**

```bash
npx vitest run src/lib/outbox/outbox.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing test for the drain**

Create `src/lib/outbox/drain.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, readOutbox } from "./outbox";
import { drainOutbox, PermanentFailure } from "./drain";

beforeEach(() => {
  localStorage.clear();
});

describe("drainOutbox", () => {
  it("delivers every queued entry and empties the queue", async () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    enqueue("submitWaterLevelReport", { zoneId: "zone-2", depthLevel: "waist" });

    const result = await drainOutbox(async () => {});

    expect(result.delivered).toBe(2);
    expect(readOutbox()).toHaveLength(0);
  });

  it("keeps an entry that failed transiently, for the next attempt", async () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    const result = await drainOutbox(async () => {
      throw new Error("offline");
    });

    expect(result.delivered).toBe(0);
    expect(readOutbox()[0].permanentlyFailed).toBe(false);
  });

  it("stops retrying a permanent failure but keeps it visible", async () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    await drainOutbox(async () => {
      throw new PermanentFailure("row-level security policy");
    });

    const [stored] = readOutbox();
    expect(stored.permanentlyFailed).toBe(true);

    // A second drain must not touch it again — retrying an RLS denial burns a
    // degraded connection for a result that cannot change.
    const dispatch = vi.fn();
    await drainOutbox(dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not stop at the first transient failure", async () => {
    // One unlucky entry must not strand every report behind it.
    const first = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    enqueue("submitWaterLevelReport", { zoneId: "zone-2", depthLevel: "waist" });

    const result = await drainOutbox(async (entry) => {
      if (entry.id === first.id) throw new Error("offline");
    });

    expect(result.delivered).toBe(1);
    expect(readOutbox()).toHaveLength(1);
  });

  it("runs one drain at a time", async () => {
    // Two concurrent drains would dispatch the same entry twice. The database
    // rejects the duplicate on its primary key, but the wasted request is a
    // real cost on the connection this app assumes.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const dispatch = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await Promise.all([drainOutbox(dispatch), drainOutbox(dispatch)]);
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx vitest run src/lib/outbox/drain.test.ts
```
Expected: FAIL — cannot resolve `./drain`.

- [ ] **Step 7: Write the drain**

Create `src/lib/outbox/drain.ts`:

```ts
"use client";

import { markDelivered, markFailed, readOutbox } from "./outbox";
import type { OutboxEntry } from "./types";

/**
 * Thrown by a dispatcher when retrying cannot help — an RLS denial, a
 * validation rejection. Anything else is treated as transient and retried.
 */
export class PermanentFailure extends Error {}

export interface DrainResult {
  delivered: number;
  failed: number;
}

/** One drain at a time: concurrent drains would dispatch the same entry twice. */
let draining = false;

export async function drainOutbox(
  dispatch: (entry: OutboxEntry) => Promise<void>
): Promise<DrainResult> {
  if (draining) return { delivered: 0, failed: 0 };
  draining = true;

  const result: DrainResult = { delivered: 0, failed: 0 };
  try {
    for (const entry of readOutbox()) {
      if (entry.permanentlyFailed) continue;
      try {
        await dispatch(entry);
        markDelivered(entry.id);
        result.delivered += 1;
      } catch (error) {
        // One entry failing must not strand the ones behind it.
        markFailed(
          entry.id,
          error instanceof Error ? error.message : String(error),
          error instanceof PermanentFailure
        );
        result.failed += 1;
      }
    }
  } finally {
    draining = false;
  }
  return result;
}
```

- [ ] **Step 8: Run the drain tests to verify they pass**

```bash
npx vitest run src/lib/outbox
```
Expected: PASS, 11 tests total.

- [ ] **Step 9: Run all gates and commit**

```bash
npm run lint && npm run typecheck && npx vitest run && npx knip && npm run build
git add src/lib/outbox
git commit -m "feat(outbox): queue writes locally so a report survives losing signal"
```

---

### Task 4: The Server Action, and the grant it needs

The first write that reaches Postgres. It is also where Plan 1's column-scoped grant meets the outbox's client-generated id and needs adjusting.

**Files:**
- Create: `supabase/migrations/<stamped version>_report_client_ids.sql`, `src/app/actions/submit-water-level-report.ts`
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `createSupabaseUserClient()` from Task 1
- Produces: `submitWaterLevelReport(input: { id: string; zoneId: string; depthLevel: DepthLevel }): Promise<{ ok: true } | { ok: false; permanent: boolean; error: string }>`

- [ ] **Step 1: Understand the grant you are about to change**

Load Supabase MCP with ONE ToolSearch call: `select:mcp__supabase__execute_sql,mcp__supabase__apply_migration,mcp__supabase__list_migrations,mcp__supabase__generate_typescript_types,mcp__supabase__get_advisors`. **No `project_id` parameter.**

```sql
select grantee, string_agg(column_name, ', ' order by column_name) as insertable
from information_schema.role_column_grants
where table_schema = 'public' and table_name = 'water_level_reports'
  and privilege_type = 'INSERT' and grantee in ('anon','authenticated')
group by grantee;
```

Expected: `authenticated` may insert `zone_id, depth_level, reporter_id` and nothing else. `anon` has none.

That grant is deliberate — it stops a resident setting their own `trust_weight` or `is_outlier`, which feed the anti-abuse reputation model. **It also blocks a client-supplied `id`,** which the outbox needs for idempotent replay.

- [ ] **Step 2: Add `id` to the insertable columns**

Write `supabase/migrations/<version>_report_client_ids.sql`:

```sql
-- The outbox generates a report's primary key on the client, so a queued
-- write that actually landed before the connection dropped conflicts on
-- insert rather than creating a second report. That requires `id` to be
-- insertable. It carries no authority: a uuid says nothing, and a duplicate
-- is refused by the primary key.
--
-- trust_weight, is_outlier and reported_at stay server-controlled — those
-- feed the anti-abuse reputation model and a client must not touch them.
grant insert (id, zone_id, depth_level, reporter_id)
  on public.water_level_reports to authenticated;
```

Apply with `apply_migration`, name `report_client_ids`. Then read the stamped version back from `list_migrations` and **name the file to match** — every existing migration follows this rule.

- [ ] **Step 3: Confirm the grant changed and nothing else did**

Re-run Step 1's query. Expected: `authenticated` now insertable on `id, depth_level, reporter_id, zone_id`. **`trust_weight`, `is_outlier` and `reported_at` must still be absent.** If any of those appear, the migration was too broad — fix it before continuing.

Then regenerate the types:
```
generate_typescript_types  →  write to src/lib/supabase/database.types.ts
```

- [ ] **Step 4: Write the failing test**

Create `src/app/actions/submit-water-level-report.test.ts`. This tests validation, which is pure — the database round trip is proven in Step 7:

```ts
import { describe, it, expect, vi } from "vitest";

const insert = vi.fn();
const getClaims = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getClaims },
    from: () => ({ insert }),
  }),
}));

import { submitWaterLevelReport } from "./submit-water-level-report";

describe("submitWaterLevelReport", () => {
  it("refuses a report with no session, permanently", async () => {
    // Not transient: without a principal there is no reporter_id to attribute
    // it to, and retrying with the same absent session cannot help.
    getClaims.mockResolvedValue({ data: null });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.stringMatching(/sign|session|auth/i) });
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a depth level that is not one of the five", async () => {
    // The five are a closed vocabulary a resident picks from a picture. A
    // sixth value means a caller is constructing requests by hand.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "shoulder" as never,
    });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.stringMatching(/depth/i) });
    expect(insert).not.toHaveBeenCalled();
  });

  it("attributes the row to the caller's own uid, never to a client-supplied one", async () => {
    // The RLS policy checks auth.uid() = reporter_id, so a mismatch is refused
    // anyway — but the action must not even try to file as someone else.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: null });

    await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ reporter_id: "user-1", id: "11111111-1111-1111-1111-111111111111" })
    );
  });

  it("treats a duplicate primary key as success, because replay is expected", async () => {
    // The outbox re-sends anything it did not see confirmed. A write that
    // landed before the connection dropped must not surface as an error.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(result).toEqual({ ok: true });
  });

  it("reports an RLS denial as permanent, not as something to retry", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: { code: "42501", message: "row-level security" } });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(result).toMatchObject({ ok: false, permanent: true });
  });

  it("reports an unknown database error as transient", async () => {
    // A connection reset must not permanently bin a resident's report.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: { code: "08006", message: "connection failure" } });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(result).toMatchObject({ ok: false, permanent: false });
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

```bash
npx vitest run src/app/actions/submit-water-level-report.test.ts
```
Expected: FAIL — cannot resolve `./submit-water-level-report`.

- [ ] **Step 6: Write the Server Action**

Create `src/app/actions/submit-water-level-report.ts`:

```ts
"use server";

import { DEPTH_LEVELS, type DepthLevel } from "@/lib/depth";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";

export interface SubmitReportInput {
  /** Generated by the outbox. Becomes the row's primary key, so replay is idempotent. */
  id: string;
  zoneId: string;
  depthLevel: DepthLevel;
}

export type SubmitReportResult =
  | { ok: true }
  | { ok: false; permanent: boolean; error: string };

/** Postgres SQLSTATEs the outbox must not keep retrying. */
const UNIQUE_VIOLATION = "23505";
const INSUFFICIENT_PRIVILEGE = "42501";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Files a resident's water-level report.
 *
 * Every write goes through a Server Action rather than straight from the
 * browser, so validation runs where a client cannot bypass it. Stage 3's
 * geofence and rate limit slot in here, and RLS is the backstop underneath.
 */
export async function submitWaterLevelReport(
  input: SubmitReportInput
): Promise<SubmitReportResult> {
  if (!DEPTH_LEVELS.includes(input.depthLevel)) {
    return { ok: false, permanent: true, error: `Unknown depth level: ${input.depthLevel}` };
  }

  const supabase = await createSupabaseUserClient();

  // getClaims, never getSession: it verifies the JWT signature against the
  // project's published keys. getSession does not revalidate and a spoofed
  // cookie would pass it.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return { ok: false, permanent: true, error: "No session — cannot attribute this report." };
  }

  const { error } = await supabase.from("water_level_reports").insert({
    id: input.id,
    zone_id: input.zoneId,
    depth_level: input.depthLevel,
    // The caller's own uid, never one supplied by the client. RLS enforces
    // this too; doing it here means we never even ask.
    reporter_id: userId,
  });

  if (!error) return { ok: true };

  // The outbox re-sends anything it did not see confirmed, so a row that
  // already landed is a success, not a failure.
  if (error.code === UNIQUE_VIOLATION) return { ok: true };

  const permanent =
    error.code === INSUFFICIENT_PRIVILEGE ||
    error.code === CHECK_VIOLATION ||
    error.code === FOREIGN_KEY_VIOLATION;

  return { ok: false, permanent, error: error.message };
}
```

- [ ] **Step 7: Run the tests, then prove it against the real database**

```bash
npx vitest run src/app/actions/submit-water-level-report.test.ts
```
Expected: PASS, 6 tests.

Then the round trip that the unit tests cannot prove. Start the app, load it in a browser so an anonymous session exists, and use the report page to file a report. Then:

```sql
select r.id, r.zone_id, r.depth_level, r.trust_weight, r.is_outlier,
       u.is_anonymous
from public.water_level_reports r join auth.users u on u.id = r.reporter_id
order by r.reported_at desc limit 3;
```

Expected: the report exists, `reporter_id` is a real anonymous user, and **`trust_weight = 1.0` and `is_outlier = false`** — the server's defaults, proving the client could not set them.

If the report page does not yet call the action (Task 5 wires it), invoke the action from a temporary page or a `node` script using the browser session — and say in your report exactly how you exercised it.

- [ ] **Step 8: Run the advisors and all gates, then commit**

```
get_advisors type: security   →  expect no new findings
```

```bash
npm run lint && npm run typecheck && npx vitest run && npx knip && npm run build
git add supabase/migrations src/app/actions src/lib/supabase/database.types.ts
git commit -m "feat(actions): file water-level reports as the signed-in resident"
```

---

### Task 5: Wire the store to the outbox

The store stops being the source of truth and becomes a view: server rows, plus whatever is still queued.

**Files:**
- Create: `src/app/api/reports/route.ts`, `src/lib/outbox/use-outbox-drain.ts`
- Modify: `src/lib/water-level-reports.ts`, `src/lib/water-level-reports.test.ts`, `src/app/layout.tsx`

**Interfaces:**
- Consumes: `enqueue`, `useOutbox`, `drainOutbox`, `PermanentFailure` (Task 3); `submitWaterLevelReport` (Task 4)
- Produces: `useWaterLevelReports(): LiveWaterLevelReport[]` — unchanged signature, new source. `addWaterLevelReport(zoneId, depthLevel): void` — unchanged signature, now queues.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/water-level-reports.test.ts`:

```ts
it("shows a queued report immediately, before it has reached the server", () => {
  // A resident who taps "knee-deep" during a flood must see their report land
  // in the list at once. Waiting on a round trip they may never complete is
  // how the app feels broken exactly when it matters.
  addWaterLevelReport("zone-1", "knee");

  const pending = readOutbox();
  expect(pending).toHaveLength(1);
  expect(pending[0].payload).toEqual({ zoneId: "zone-1", depthLevel: "knee" });
});

it("gives the optimistic row the same id the server will use", () => {
  // Reconciliation is by id: when the server row arrives it replaces the
  // optimistic one rather than appearing beside it as a duplicate.
  addWaterLevelReport("zone-1", "knee");
  const [queued] = readOutbox();

  const merged = mergeReports([], readOutbox());
  expect(merged.map((r) => r.id)).toEqual([queued.id]);
});

it("does not show a queued report twice once the server row arrives", () => {
  addWaterLevelReport("zone-1", "knee");
  const [queued] = readOutbox();

  const serverRow = {
    id: queued.id,
    zoneId: "zone-1",
    depthLevel: "knee" as const,
    reportedAt: new Date().toISOString(),
    trustWeight: 1,
    isOutlier: false,
    reporterId: "user-1",
  };

  expect(mergeReports([serverRow], readOutbox())).toHaveLength(1);
});
```

Import `readOutbox` from `@/lib/outbox/outbox` and `mergeReports` from `./water-level-reports` at the top of the file.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/water-level-reports.test.ts
```
Expected: FAIL — `mergeReports` is not exported.

- [ ] **Step 3: Rewrite the store**

In `src/lib/water-level-reports.ts`:

- Change `LiveWaterLevelReport.deviceId` to `reporterId`. `device-id.ts` still exists for pins and check-ins and is deleted in the next plan — **do not delete it here.**
- Export a pure `mergeReports(serverRows: LiveWaterLevelReport[], queued: OutboxEntry[]): LiveWaterLevelReport[]` that appends queued entries as optimistic rows, skipping any whose id already appears in `serverRows`. Dedup by id is what makes reconciliation exact rather than heuristic.
- `addWaterLevelReport(zoneId, depthLevel)` now calls `enqueue("submitWaterLevelReport", { zoneId, depthLevel })` and triggers a drain. It stays `void`-returning so its call sites do not change.
- `useWaterLevelReports()` returns `mergeReports(serverRows, useOutbox())`, where `serverRows` come from a fetch of `/api/reports` held in a small store. **Failure to fetch must not throw** — a resident with no network still sees their own queued reports, which is the whole point.

Keep `getRecentReportsForZoneLive` and `minutesSinceReport` working; their call sites must not change.

- [ ] **Step 4: Write the route handler**

Create `src/app/api/reports/route.ts`. Reports are world-readable (`select using (true)`), so this uses the **public** client, not the user client:

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Recent reports, newest first. Public: the count of neighbours reporting is what makes the signal trustworthy. */
export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("water_level_reports")
    .select("id, zone_id, depth_level, reporter_id, reported_at, trust_weight, is_outlier")
    .order("reported_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json(
    data.map((row) => ({
      id: row.id,
      zoneId: row.zone_id,
      depthLevel: row.depth_level as LiveWaterLevelReport["depthLevel"],
      reporterId: row.reporter_id,
      reportedAt: row.reported_at,
      trustWeight: Number(row.trust_weight),
      isOutlier: row.is_outlier,
    }))
  );
}
```

Import `LiveWaterLevelReport` as a type from `@/lib/water-level-reports`. Follow the per-field assertion pattern `/api/zones` and `/api/alerts` already use for CHECK-constrained `text` columns — **never a whole-result cast**.

- [ ] **Step 5: Drain on load and on reconnect**

Create `src/lib/outbox/use-outbox-drain.ts`:

```ts
"use client";

import { useEffect } from "react";
import { submitWaterLevelReport } from "@/app/actions/submit-water-level-report";
import { drainOutbox, PermanentFailure } from "./drain";
import { readOutbox } from "./outbox";
import { ensureAnonymousSession } from "@/lib/auth/anonymous-session";
import type { OutboxEntry } from "./types";

async function dispatch(entry: OutboxEntry): Promise<void> {
  const result = await submitWaterLevelReport({
    id: entry.id,
    ...(entry.payload as { zoneId: string; depthLevel: never }),
  });
  if (result.ok) return;
  throw result.permanent ? new PermanentFailure(result.error) : new Error(result.error);
}

/**
 * Replays queued writes when a session and a network exist. Mounted once.
 *
 * Attribution happens here, not at queue time: a report made before the
 * resident had any identity gets the uid they eventually receive. That is
 * honest — the report genuinely is from that device — and it is the only
 * option, since there was no identity to record when they made it.
 */
export function useOutboxDrain(): void {
  useEffect(() => {
    const run = () => {
      // Nothing queued means nothing to attribute, so do not sign anyone in.
      // This guard is what keeps a visitor who only reads from becoming a
      // permanent row in auth.users — see Task 2 Step 6.
      if (readOutbox().length === 0) return;

      void ensureAnonymousSession().then((userId) => {
        if (userId) void drainOutbox(dispatch);
      });
    };

    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);
}
```

Mount it from a tiny client component rendered in `src/app/layout.tsx` beside `<ServiceWorkerRegistration />`.

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```
Expected: PASS. Report the total and account for the delta from 411.

- [ ] **Step 7: Run all gates and commit**

```bash
npm run lint && npm run typecheck && npx knip && npm run build
git add src/lib/water-level-reports.ts src/lib/water-level-reports.test.ts src/lib/outbox src/app/api/reports src/app/layout.tsx
git commit -m "feat(reports): write water-level reports through the outbox"
```

---

### Task 6: Prove it offline, end to end

Everything above is unit-tested or verified against a live database while online. This task proves the one claim the whole plan exists for: **a report made with no signal is not lost.**

**Files:**
- Modify: `src/lib/service-worker.test.ts` if the offline path needs a guard; otherwise none

- [ ] **Step 1: Build and serve the production app**

```bash
npm run build && npm run start
```

- [ ] **Step 2: Establish a session and a baseline**

Load `http://localhost:3000` in a browser, complete onboarding so a zone is selected, and confirm via MCP `execute_sql` that an anonymous user and its profile exist:

```sql
select count(*) as anon_users from auth.users where is_anonymous;
select count(*) as reports from public.water_level_reports;
```
Record both numbers.

- [ ] **Step 3: Go offline and file a report**

Take the network down. If the browser preview pane cannot register a service worker in this environment, use real Chrome; if no offline toggle is available, stop the `npm run start` process — say in your report which you did.

File a water-level report through the UI. Expected:
- The report appears in "what neighbours are reporting" **immediately**.
- No error is shown to the resident.
- `localStorage["weatherwell.outbox"]` contains one entry.

- [ ] **Step 4: Confirm nothing reached the database**

```sql
select count(*) as reports from public.water_level_reports;
```
Expected: unchanged from Step 2. If it grew, the write did not actually go through the outbox and the offline path is not what you think it is.

- [ ] **Step 5: Come back online and confirm it lands**

Restore the network (or restart the server). The `online` listener should drain without a reload — **wait for it rather than reloading**, because a reload would prove a weaker claim.

```sql
select id, zone_id, depth_level, trust_weight, is_outlier, reported_at
from public.water_level_reports order by reported_at desc limit 3;
```

Expected: the report is there. Its `id` matches the outbox entry's id from Step 3 — **check this specifically**, because it is what proves replay is idempotent rather than accidentally-not-duplicated. `trust_weight = 1.0` and `is_outlier = false`, server-set.

`localStorage["weatherwell.outbox"]` is now empty.

- [ ] **Step 6: Prove replay is idempotent**

Re-queue the same entry by hand — copy the delivered entry back into `localStorage["weatherwell.outbox"]` and dispatch the drain (reload the page, which drains on mount).

```sql
select count(*) from public.water_level_reports where id = '<that id>';
```
Expected: exactly **1**, and the outbox empty again. The action treats a `23505` unique violation as success, so a re-sent write that already landed is absorbed rather than duplicated. **If the count is 2, the client-generated id is not reaching the insert** and the idempotency claim is false.

- [ ] **Step 7: Stop the server, run all gates, commit and push**

```bash
npm run lint && npm run typecheck && npx vitest run && npx knip && npm run build
git add -A
git commit -m "test(outbox): verify a report survives losing signal end to end"
git push origin v0
```

---

## Self-Review

**Spec coverage.** Anonymous auth as the principal RLS keys off: Task 2. Writes through Server Actions rather than the browser: Task 4. Queue-first writes with attribution at replay: Tasks 3 and 5. `/api/reports`: Task 5. The spec's `submitWaterLevelReport` action: Task 4. The migration adjusting Plan 1's column grant is not in the spec — it is a consequence of the outbox design the spec asks for, and Task 4 Step 2 states the reasoning inline.

**One deliberate departure, flagged for a reviewer rather than buried.** The spec puts the outbox in IndexedDB; this plan uses `localStorage` through the existing tested abstraction, because entries are a few hundred bytes and IndexedDB's async API would make every call site async for no benefit at this size. Task 3 states it and asks the implementer to record it.

**Deferred, named so the gap is visible:** the remaining four stores (pins, votes, check-ins, overrides), `/api/pins` and `/api/check-ins` with its `no-store` branch, the `zone-overrides` collapse, layer 9 on `superseded_severity`, deleting `device-id.ts` — all Plan 4. The operator PIN gate, CI database wiring and monitoring — Plan 5. **Plan 4 additionally inherits the stale-override finding as a required item**, restated at the top of this plan so it cannot be lost between documents.

**Type consistency.** `OutboxEntry` has the same fields in Tasks 3, 5 and 6. `enqueue(operation, payload)` and `drainOutbox(dispatch)` keep their signatures across Tasks 3 and 5. `submitWaterLevelReport(input)` takes `{ id, zoneId, depthLevel }` in Tasks 4 and 5. `LiveWaterLevelReport.reporterId` replaces `deviceId` in Task 5 and is used with that name in Task 5's route handler. `PermanentFailure` is defined in Task 3 and thrown in Task 5.

**Test-count arithmetic, stated relatively on purpose.** The baseline is 411 across 71 files, but Tasks 1–4 add tests before Task 5 runs, so any absolute figure here would be wrong by the time it was read. Each task reports its own delta; Task 5 Step 6 asks for the total and its accounting.

**Known risk.** Task 1's Proxy is the highest-risk piece: a mistake between `createServerClient` and `getClaims()` causes residents to be *randomly* logged out, which is both severe and very hard to attribute. The plan states the rule, and the code block is written so nothing sits between those two calls. A reviewer should check that specifically.
