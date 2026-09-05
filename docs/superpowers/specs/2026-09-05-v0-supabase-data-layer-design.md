# v0 — Supabase Data Layer

**Date:** 2026-09-05
**Branch:** `v0`
**Stage:** 2 (`v0` · Functional build), first slice
**Status:** design approved, not yet implemented

---

## Why this slice exists

Stage 1 shipped a complete prototype in which every write goes to the writing device's own `localStorage`. That is fine as a demonstration and false as a system. The clearest expression of the problem: an operator downgrading an alert changes what *the operator* sees, and nobody else. The barangay's warning is not shared state, so there is no warning — only a convincing rehearsal of one.

This slice makes the shared things actually shared. It is deliberately not all of Stage 2.

### In scope

Postgres schema, Row Level Security, Server Actions, the two route handlers `public/sw.js` already routes for, an offline-tolerant write path, and migrating the five shared `localStorage` stores.

### Out of scope — each gets its own design cycle

| Deferred | Why not here |
|---|---|
| Operator PIN gate UI | Needs the backend first. Ships next, and must ship before any real deployment — an unauthenticated `/admin` against a shared database can change what a whole barangay is told. |
| Background Sync registration | The write path here is queue-first, so this becomes a small addition rather than a rewrite. See [Offline writes](#offline-writes). |
| Offline map tiles | Independent of the data layer. |
| Self-hosted OSRM | A separate infrastructure project. |
| Real PAGASA and hazard data | Gated on an institutional data request with an unknown timeline. Open the request in parallel; it cannot be scheduled. |
| Pin photos going live | A privacy decision, blocked on extending the consent and retention rules first. |
| Error/uptime monitoring | Small and independent. |

---

## Decisions taken, and why

### 1. Guest identity: Supabase anonymous auth, writes through Server Actions

A guest has no account, but RLS needs a principal. Every device silently calls `signInAnonymously()` on first run, so `auth.uid()` is a real principal and policies are enforced by Postgres rather than by application code. All writes still route through Server Actions, so validation runs server-side where a client cannot bypass it — which is precisely where Stage 3's geofence and rate-limit checks will slot in.

Rejected: service-role-only writes with the device ID as a plain column, because the real security would live in TypeScript and one forgotten check is a hole RLS cannot catch. Rejected outright: the browser writing directly with the public anon key, because that key ships in the bundle.

**Consequence — `weatherwell.deviceId` retires.** `auth.uid()` replaces it. This *strengthens* anti-abuse layer 5 (device fingerprint): the identity becomes server-issued and server-verified instead of a random string the client generates and can clear at will.

### 2. Five stores move; three stay on the device

| Store | Destination | Reason |
|---|---|---|
| `weatherwell.zoneOverrides` | `alerts`, `evacuation_centers` | The operator's decision must reach residents. This is the central fix. |
| `weatherwell.communityPins` | `community_pins` | One resident creates, others must see. |
| `weatherwell.communityPinVotes` | `pin_votes` | The tally is shared; one vote per person is a server constraint. |
| `weatherwell.waterLevelReports` | `water_level_reports` | The sensor network only works if reports aggregate across devices. |
| `weatherwell.evacuationCheckIns` | `evacuation_check_ins` | The operator needs the headcount. |
| `weatherwell.onboarded` | stays local | Describes this phone, not shared state. Also must be readable with no network on first run. |
| `weatherwell.selectedZoneId` | stays local | Same. Syncing it is only meaningful once accounts exist. |
| `weatherwell.deviceId` | **retired** | Superseded by `auth.uid()`. |

### 3. Reads: a client store fed by route handlers

23 non-test files import `MOCK_ZONES` synchronously. They change one import line each to `useZones()`, which hydrates once from `/api/zones` and returns synchronously afterwards — the same `useSyncExternalStore` idiom already in `src/lib/local-storage-store.ts`.

This honours a decision the codebase already made: `public/sw.js` routes `/api/zones` as stale-while-revalidate and `/api/alerts` as network-first. Those handlers were never built. Offline reads therefore work by construction, through a cache that already exists.

Rejected: async Server Components with prop drilling, because most of the 23 files are already `"use client"` (Leaflet, live position, local storage) and this would restructure the tree while moving the offline guarantee onto cached HTML instead of cached data.

### 4. Operator role: a `profiles` row promoted by hand

`profiles.role` defaults to `resident`. An operator is promoted by running one SQL statement against the pilot barangay's account. No invite flow, no self-service, no admin UI — matching the PRD's stated "one barangay, one operator" scale decision. RLS reads the role through a `security definer` function so policies do not recurse on `profiles`.

---

## Schema

Normalised in Postgres, **denormalised in the API response**, so `/api/zones` returns the existing `Zone` shape and the 23 consuming files keep their types unchanged.

```sql
-- Reference data. Seeded, never written from a client.
create table zones (
  id                     text primary key,
  psgc_barangay_code     text not null,
  name                   text not null,
  evacuation_route_text  jsonb not null,          -- LocalizedText
  lat                    double precision not null,
  lng                    double precision not null,
  evacuation_route_path  jsonb not null,          -- [number, number][]
  hotline_number         text not null,
  downstream_zone_id     text references zones (id)
);

create table evacuation_centers (
  id                 text primary key,
  zone_id            text not null unique references zones (id),
  name               text not null,
  lat                double precision not null,
  lng                double precision not null,
  capacity           integer not null check (capacity > 0),
  -- Manual fallback, used only when current_occupancy is null.
  status             text not null default 'space_available'
                       check (status in ('space_available','limited','full')),
  -- Live headcount. When present this derives status; see PRD Gap B.
  current_occupancy  integer check (current_occupancy >= 0)
);

create table points_of_interest (
  id       text primary key,
  zone_id  text not null references zones (id),
  category text not null check (category in
             ('health_center','pharmacy','market','water_station','barangay_office')),
  name     text not null,
  lat      double precision not null,
  lng      double precision not null
);

create table hazard_susceptibility (
  id          text primary key,
  zone_id     text not null references zones (id),
  hazard_type text not null check (hazard_type in ('flood','landslide','storm_surge')),
  risk_level  text not null check (risk_level in ('low','medium','high')),
  unique (zone_id, hazard_type)
);

-- Identity.
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'resident' check (role in ('resident','operator')),
  zone_id    text references zones (id),
  created_at timestamptz not null default now()
);

-- Alerts. An operator action deactivates the current row and inserts a new one.
create table alerts (
  id               uuid primary key default gen_random_uuid(),
  zone_id          text not null references zones (id),
  severity         text not null check (severity in ('yellow','orange','red','evacuate')),
  message          jsonb not null,                -- LocalizedText
  source           text not null check (source in
                     ('manual','auto_crowdsourced','predicted','cascade')),
  confidence       text not null default 'estimated'
                     check (confidence in ('estimated','validated','calibrated')),
  predicted_timing jsonb,                         -- LocalizedText, nullable
  issued_at        timestamptz not null default now(),
  issued_by        uuid references auth.users (id),   -- null for automated alerts
  is_active        boolean not null default true,
  superseded_at    timestamptz,
  -- The severity this row replaced, so a downgrade notice needs no join.
  superseded_severity text check (superseded_severity in
                        ('yellow','orange','red','evacuate'))
);

-- At most one active alert per zone. This is the invariant the whole
-- resolve-effective-alert machinery used to emulate in the client.
create unique index alerts_one_active_per_zone
  on alerts (zone_id) where is_active;

create table water_level_reports (
  id           uuid primary key default gen_random_uuid(),
  zone_id      text not null references zones (id),
  depth_level  text not null check (depth_level in ('dry','ankle','knee','waist','neck')),
  reporter_id  uuid not null references auth.users (id),
  reported_at  timestamptz not null default now(),
  trust_weight numeric not null default 1.0,      -- layer 6, written but unread until Stage 4
  is_outlier   boolean not null default false     -- layer 4, set by fixture today
);

create table community_pins (
  id             uuid primary key default gen_random_uuid(),
  zone_id        text not null references zones (id),
  status_tag     text not null,
  caption        text not null,
  photo_path     text,                            -- Storage path; null until photos ship
  lat            double precision not null,
  lng            double precision not null,
  author_id      uuid not null references auth.users (id),
  created_at     timestamptz not null default now(),
  -- Soft delete: PRD layer 7 says an operator may remove *or restore*.
  removed        boolean not null default false,
  removed_reason text check (removed_reason in ('net_score','admin'))
);

create table pin_votes (
  pin_id    uuid not null references community_pins (id) on delete cascade,
  voter_id  uuid not null references auth.users (id),
  direction smallint not null check (direction in (1, -1)),
  voted_at  timestamptz not null default now(),
  primary key (pin_id, voter_id)                  -- one vote per person, enforced by the database
);

create table evacuation_check_ins (
  id            uuid primary key default gen_random_uuid(),
  zone_id       text not null references zones (id),
  user_id       uuid not null references auth.users (id),
  status        text not null check (status in ('safe','needs_help')),
  checked_in_at timestamptz not null default now(),
  unique (zone_id, user_id)                       -- one standing check-in per zone
);
```

Vote counts are **derived**, not stored: `community_pins` carries no `upvotes`/`downvotes` column, because a denormalised counter alongside a `pin_votes` table is two sources of truth for one number. `/api/pins` returns the tallies from an aggregate, so the client's existing `CommunityPin` interface keeps its `upvotes` and `downvotes` fields and its consumers do not change. The same response carries the caller's own vote direction, which is what `hasVotedOnPin` currently reads from a separate local store.

---

## Row Level Security

Enabled on every table. Nothing is writable from a client except through a Server Action, and the policies below are the backstop that makes a forgotten check in TypeScript non-fatal.

### Four rules this section obeys

Supabase's own Postgres guidance names traps that a first-pass policy set walks straight into. Each of these changed the design:

1. **Anonymous users carry the `authenticated` Postgres role.** Since every resident here signs in anonymously, `TO authenticated` includes them — which is what we want, but it means the role can never distinguish a guest from a real account. Anything needing that distinction must read `auth.jwt() ->> 'is_anonymous'`, not the role. `auth.role()` is deprecated and is specifically broken by anonymous sign-ins; it appears nowhere below.
2. **`TO authenticated` alone is authentication without authorization.** Every policy pairs the role with an ownership predicate.
3. **`UPDATE` needs both `USING` and `WITH CHECK`.** With only `USING`, a user can pass the check and then reassign the row's owner on the way out. `UPDATE` also silently returns zero rows with no error when there is no `SELECT` policy.
4. **`auth.uid()` is wrapped in a subselect.** Bare, it is evaluated per row; `(select auth.uid())` is evaluated once.

### The operator check

`is_operator` is `SECURITY DEFINER`, which bypasses RLS — necessary to read `profiles` from inside a policy, and dangerous by default. Postgres grants `EXECUTE` to `PUBLIC` on every new function, so the same function in the `public` schema would be a callable endpoint that lets anyone enumerate operators by uuid. It therefore takes **no argument**, reads `auth.uid()` itself, lives in a private schema, pins `search_path`, and has execute revoked:

```sql
create schema if not exists private;

create or replace function private.is_operator()
  returns boolean
  language sql
  security definer
  set search_path = ''      -- else the definer's path is an injection vector
  stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'operator'
  );
$$;

revoke execute on function private.is_operator()
  from public, anon, authenticated, service_role;
```

> **Verify at implementation time.** Whether a policy can call a function the querying role lacks `EXECUTE` on is the one thing here not to take on trust. The first RLS test asserts both halves: a resident can still read pins, *and* cannot call `private.is_operator()` directly. If the revoke breaks policy evaluation, the fallback is to keep the revoke off `authenticated` and rely on the function taking no argument, which already removes the enumeration vector.

### Policies

```sql
-- Reference data: world-readable, never client-writable.
zones, evacuation_centers, points_of_interest, hazard_susceptibility
  for select to anon, authenticated using (true)
  -- no insert/update/delete policy at all, so every write is denied

alerts
  for select to anon, authenticated using (true)
  for insert to authenticated with check ((select private.is_operator()))
  for update to authenticated using       ((select private.is_operator()))
                             with check   ((select private.is_operator()))

water_level_reports
  for select to anon, authenticated using (true)
  for insert to authenticated with check ((select auth.uid()) = reporter_id)
  -- no update or delete: a report is a historical observation

community_pins
  for select to anon, authenticated using (true)
  for insert to authenticated with check ((select auth.uid()) = author_id)
  for update to authenticated
      using      ((select auth.uid()) = author_id or (select private.is_operator()))
      with check ((select auth.uid()) = author_id or (select private.is_operator()))
  -- no delete: removal is the soft-delete flag, so restore stays possible

pin_votes
  for select to anon, authenticated using (true)
  for insert to authenticated with check ((select auth.uid()) = voter_id)
  for update to authenticated                       -- changing your own vote
      using      ((select auth.uid()) = voter_id)
      with check ((select auth.uid()) = voter_id)

evacuation_check_ins
  for select to authenticated
      using ((select auth.uid()) = user_id or (select private.is_operator()))
  for insert to authenticated with check ((select auth.uid()) = user_id)
  for update to authenticated
      using      ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)

profiles
  for select to authenticated
      using ((select auth.uid()) = id or (select private.is_operator()))
  -- no client insert: a trigger on auth.users creates the row
  -- no client update: role is not self-assignable, which is the entire point
```

Every column named in a policy gets an index: `water_level_reports.reporter_id`, `community_pins.author_id`, `pin_votes.voter_id`, `evacuation_check_ins.user_id`.

Check-ins are the one table that is **not** world-readable. A check-in says where a named person is and whether they need help; residents see their own, the operator sees the zone.

`evacuation_centers.current_occupancy` is operator-written, which is why centers carry no client write policy — occupancy changes go through a Server Action.

### Two exposure traps

**Tables created by SQL are not automatically reachable through the Data API.** That is a separate setting from RLS: RLS decides which *rows* are visible once a table is reachable at all. The migration grants `anon` and `authenticated` explicitly, and enables RLS on every table in `public` — including any that later look internal, because `public` is an exposed schema by default.

**Views bypass RLS.** If `/api/zones` denormalises through a view rather than a query, it must be created `with (security_invoker = true)`, or the join silently returns rows the caller's policies would have refused.

---

## Server Actions

Every mutation. Each validates, then writes as the calling user.

| Action | Replaces | Notes |
|---|---|---|
| `submitWaterLevelReport(zoneId, depthLevel)` | `addWaterLevelReport` | Stage 3 adds geofence + rate limit here. |
| `createPin(input)` / `editPin` / `deleteOwnPin` | `addCommunityPin` etc. | Ownership checked server-side, not by `isOwnPin`. |
| `voteOnPin(pinId, direction)` | `voteOnPin` | Upsert on `(pin_id, voter_id)`. Net-score removal evaluated after the write. |
| `setPinRemoved(pinId, removed, reason)` | `removePinByAdmin` / `restoreCommunityPin` | Operator only. |
| `recordCheckIn(zoneId, status)` | `recordCheckIn` | Upsert on `(zone_id, user_id)`. |
| `setZoneAlert(zoneId, severity \| "none")` | `setZoneAlertOverride` | Transactional; see below. |
| `setCenterStatus(zoneId, status)` | `setZoneCenterStatusOverride` | Operator only. |
| `setCenterOccupancy(zoneId, occupancy)` | `setZoneOccupancyOverride` | Operator only. |

### `setZoneAlert` is the one with real logic

A single transaction, because the partial unique index forbids two active alerts for a zone:

```
begin
  select current active alert for zone           -- may be none
  if exists:
      update it: is_active = false, superseded_at = now()
  if severity != "none":
      insert new row:
        severity, message, source = 'manual', issued_by = auth.uid(),
        superseded_severity = <the previous row's severity, or null>
commit
```

Message copy follows the rule established in Stage 1 and now enforced by the database's own separation of rows: **copy written for one severity never survives onto another.** A new row gets generated copy for its own severity unless the operator is confirming the severity already in place.

---

## Route handlers

Five. Two of them match what `public/sw.js` already routes; the other three are community data that also needs a read path.

| Route | Auth | SW strategy | Returns |
|---|---|---|---|
| `GET /api/zones` | public | stale-while-revalidate, unversioned `ZONE_CACHE` *(already written)* | Zones joined with their centre, POIs and hazard ratings — the existing `Zone` shape plus centre fields |
| `GET /api/alerts` | public | network-first, no timeout *(already written)* | Active alerts, plus alerts superseded within the downgrade window |
| `GET /api/pins` | public | stale-while-revalidate | Non-removed pins with vote tallies aggregated from `pin_votes`, plus the caller's own vote direction |
| `GET /api/reports` | public | stale-while-revalidate | Recent water-level reports per zone |
| `GET /api/check-ins` | **operator or own** | network-only, never cached | Scoped by RLS: a resident receives only their own rows, an operator receives their zone's |

The first four are public and unauthenticated, because that is the data a resident must be able to read with no account and no signal.

**`/api/check-ins` is the exception and must not be cached.** A check-in names a person and says whether they need help. RLS already scopes the rows, but a shared HTTP cache would let one device's response be served to another. It gets an explicit `Cache-Control: no-store` and an explicit early return in the service worker, alongside the existing alerts branch.

### One `sw.js` change

Today the fetch handler special-cases `/api/alerts` and `/api/zones`, and everything else same-origin falls through to stale-while-revalidate in `ASSET_CACHE`. That fallthrough would quietly put community data — and check-ins — in the asset cache, which is both wrong and, for check-ins, a privacy leak.

The handler gains an explicit `/api/` branch before the fallthrough: check-ins bypass the cache entirely, and the remaining community routes use stale-while-revalidate against a named community cache rather than the asset cache. Versioned like the others, unlike `ZONE_CACHE`.

`/api/zones` remains the one cache the PRD deliberately exempts from version-bumping, so a device that updates and then loses signal keeps its evacuation instructions. That constraint is inherited, not new.

---

## What collapses

### `zone-overrides.ts` mostly dissolves

The merge machinery — `resolveEffectiveAlert` reconciling a hardcoded mock alert against a local override — exists only because there was no writable alert store. With Postgres there are just alerts. The partial unique index enforces in the database what the resolver emulated in the client.

**Layer 9 survives, and gets simpler.** `superseded_severity` on the new row means the downgrade notice needs no join and no history walk:

- Active alert with `superseded_severity` set and more severe than `severity` → *"Alert downgraded — X lowered to Y"*
- No active alert, but a row superseded recently → *"Alert lifted — the earlier X was withdrawn"*

Both need a **recency window**, which the client-side version never needed because a `localStorage` override was implicitly current. A resident opening the app two days after an all-clear should not be told an alert was just lifted. The window is **6 hours**, defined in one constant and tunable: long enough to cover someone who slept through the change, short enough that it reads as news.

The functions that survive unchanged are the pure ones with no storage dependency: `deriveCenterStatusFromOccupancy`, `resolveEffectiveCenterStatus`. They move to a module named for what they do rather than for a storage mechanism that no longer exists.

### `device-id.ts` is deleted

`getDeviceId()` has no callers once `auth.uid()` carries identity.

---

## Offline writes

The write path is **queue-first from the start**, not retrofitted. This is a direct consequence of anonymous auth: a device with no network and no cached session cannot call `signInAnonymously()`, so it has no identity and cannot write. Reads still work from cache; writes must survive until they can be attributed.

A single outbox sits in front of every Server Action:

```
mutate(action)
  1. apply optimistically to the local store  -> UI updates immediately
  2. if online and authenticated: send now
  3. otherwise: append to the outbox (IndexedDB) and retry on reconnect
  4. on success: reconcile the optimistic entry against the server's row
  5. on permanent failure: surface it, and keep the entry — never drop silently
```

Attribution happens **at replay time**, not at queue time: a report made by a device that has never authenticated gets the `auth.uid()` it eventually receives. This is honest — the report is genuinely from that device — and it is the only option available, since there is no identity to record beforehand.

Background Sync (next slice) then reduces to registering a sync event that drains this same outbox. It is not a second mechanism.

**One consequence worth stating plainly:** a resident who installs during a storm with no signal still gets nothing, exactly as the PRD already admits. The outbox helps someone who *has* the app and loses signal, which is the case the product is actually for.

---

## Seeding

`src/lib/mock-data/` stays as the single source of truth for demo content and becomes the input to a generated seed script, rather than being hand-copied into SQL. Four barangays, their centres, POIs, hazard ratings, seed pins and seed reports.

Seed pins and reports currently carry `deviceId: "seed-device-1"`. With `author_id` now a real foreign key to `auth.users`, seeds need a designated seed account, created by the seed script and clearly marked. Seed rows must be distinguishable from real ones so a pilot can delete them.

---

## Testing

Three layers, because they fail for different reasons.

**Pure logic — unchanged, still the majority.** `depth`, `severity`, `zone-status`, `risk-engine`, `bearing-distance`, `route-hazard`, `contrast`, `service-worker` have no storage dependency and keep passing untouched.

**Component tests — the bulk of the churn.** Tests that assume a synchronous `MOCK_ZONES` move to a seeded provider wrapper. `src/test-utils/mock-fixtures.ts` becomes the seed, and gains a `renderWithZones()` helper so the change is one wrapper per test file rather than a rewrite per test. This is mechanical and it is most of the diff — worth planning for rather than discovering at task six.

**Database tests — new.** RLS policies are the security boundary, so they need tests that assert the *denials*, not just the permissions. Each of these corresponds to a trap named above, so they are regression tests for real mistakes rather than a box-ticking sweep:

- a resident cannot insert or update an alert
- a resident cannot vote twice on one pin (primary key), nor change another person's vote
- a resident cannot read another resident's check-in; an operator can read their zone's
- a resident cannot write to `zones`, `evacuation_centers`, `points_of_interest` or `hazard_susceptibility`
- a resident cannot update a pin to reassign `author_id` to someone else (the `WITH CHECK` trap)
- a resident cannot set their own `profiles.role` to `operator`
- an anonymous user is refused everywhere a resident is, since anonymous users carry the `authenticated` role and would otherwise pass a role-only check
- `private.is_operator()` is not directly callable by `anon` or `authenticated`

These run against a local Supabase instance (`supabase start`) with pgTAP or plain SQL assertions.

CI gains a Supabase service container. The existing five gates (lint, typecheck, test, knip, build) stay.

### Schema change workflow

Iterate with `execute_sql` (MCP) or `supabase db query`, which run SQL without writing migration history. **Do not use `apply_migration` to iterate** — it writes a history entry per call, so `supabase db diff` and `db pull` then produce empty or conflicting diffs and the first attempt is the one you are stuck with. When a change is settled: run `supabase db advisors` (or MCP `get_advisors`) and fix what it reports, then `supabase db pull <name> --local --yes` to generate the migration, then `supabase migration list --local` to verify.

---

## Rollout order

Each step leaves the app working, so the branch is never mid-teardown:

1. Supabase project, migrations, RLS, seed script — nothing in the app changes yet
2. Anonymous auth on first run, `profiles` trigger — identity exists, still unused
3. `/api/zones` + `useZones()`; the 23 files switch import — reads are real, writes still local
4. Outbox + the first Server Action (`submitWaterLevelReport`) — one write path proven end to end
5. Remaining route handlers and the `sw.js` `/api/` branch, including `no-store` for check-ins
6. Remaining Server Actions; the four remaining stores migrate
7. `zone-overrides.ts` collapses; `device-id.ts` deleted; layer 9 re-pointed at `superseded_severity`
8. RLS test suite; CI Supabase container

Step 3 is the largest single diff. Step 7 is the one that can silently regress behaviour just shipped on `hi-fi`, so the layer 9 regression tests must be made to pass against the new source **without being weakened** — the test that proves a cleared alert still announces itself is the acceptance criterion for that step, not an afterthought.

---

## Risks and open questions

- **Anonymous auth rows accumulate**, one per device per browser profile, including throwaway visits. Supabase has no automatic reaping. A scheduled cleanup of anonymous users with no rows attached is needed before pilot scale; not before it works.
- **A cleared browser is a new person.** Clearing site data destroys the anon session, so a resident loses their pins and votes and can vote again on the same pin. This is the same weakness the device ID had, now stated honestly rather than implied — and it is exactly what anti-abuse layer 6 (reputation) and device-fingerprint hardening exist to address in Stage 4. It should not be presented as solved here.
- **The 6-hour downgrade window is a guess.** No data supports it. It is one constant, deliberately, so a pilot can change it.
- **RLS on `evacuation_check_ins` assumes the operator is trusted with names.** That is a privacy position, not just a technical one, and it belongs in the RA 10173 review the PRD already flags as outstanding.
- **Seed data in a real database is a liability.** Four demo barangays with fake reports must not survive into a pilot deployment. The seed script needs a matching teardown.
- **`supabase.auth.signInAnonymously()` must be enabled per-project** and is off by default. It is also rate-limited per IP, which matters for a barangay behind one NAT.

---

## PRD changes this slice requires

The PRD is written to stay true as the build progresses, so most of it needs nothing. These do change:

- **Build Status** — new rows as each step lands; `All data | Mock` retires.
- **Anti-Abuse layer 5** — the description changes from a client-generated random ID to a server-issued anonymous auth identity. This is an improvement and should be stated as one.
- **Architecture → Backend** — the table list gains `pin_votes` tallies being derived, and the `profiles` role model should be named.
- **Privacy & Data** — anonymous auth creates a persistent per-device identity where the PRD currently describes a random local ID. Retention for anonymous users needs a row in the retention table.
- **Roadmap Stage 2** — no change to the exit criteria. This slice does not meet them alone, and should not claim to.
