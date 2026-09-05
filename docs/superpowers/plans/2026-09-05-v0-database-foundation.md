# v0 Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the WeatherWell Postgres schema, its Row Level Security policies, and a seed, so the application has a real backend to migrate onto — with the security boundary proven by tests that assert denials.

**Architecture:** Ten tables in `public`, all RLS-enabled and explicitly granted to `anon`/`authenticated`. Identity comes from Supabase anonymous auth, so `auth.uid()` is the principal every policy keys off. The operator check is a no-argument `SECURITY DEFINER` function in a private schema. Migration SQL is authored by hand into `supabase/migrations/` (the repo is the source of truth) and applied through the MCP server, because the Supabase CLI and Docker are not installed on this machine.

**Tech Stack:** Postgres 17.6 (Supabase project `keoxneujsebuedqbmqxz`, region ap-northeast-1), Supabase Auth with anonymous sign-ins, Supabase MCP server for `execute_sql` / `apply_migration` / `get_advisors`.

**Spec:** [docs/superpowers/specs/2026-09-05-v0-supabase-data-layer-design.md](../specs/2026-09-05-v0-supabase-data-layer-design.md)

**Scope:** This is plan 1 of 2 for that spec. It ends with a working, seeded, tested database and **no application code changed**. Plan 2 (route handlers, `useZones`, the outbox, Server Actions, store migration, the `zone-overrides` collapse) is written after this one executes, because Task 2 resolves an open question that changes Plan 2's policies.

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include these.

- **Project ref:** `keoxneujsebuedqbmqxz`. Postgres 17. Never target another project.
- **RLS on every table in `public`** — `public` is an exposed schema by default, so a table without RLS is world-writable through the Data API.
- **Tables created by SQL are not automatically reachable through the Data API.** Every table gets an explicit `grant` to `anon` and `authenticated`.
- **Every policy names its roles with a `TO` clause.** Never `auth.role()` — it is deprecated and is specifically broken by anonymous sign-ins, because anonymous users carry the `authenticated` role.
- **`TO authenticated` alone is authentication without authorization.** Every policy pairs the role with an ownership predicate.
- **Every `UPDATE` policy has both `USING` and `WITH CHECK`.** Without `WITH CHECK` a user can reassign a row's owner on the way out.
- **`auth.uid()` is always wrapped:** `(select auth.uid())`, never bare — bare is evaluated once per row.
- **`SECURITY DEFINER` functions live in the `private` schema, take no user-supplied identity argument, and set `search_path = ''`.**
- **Views that denormalise must be created `with (security_invoker = true)`** or they bypass RLS.
- **Iterate with `execute_sql`. Never iterate with `apply_migration`** — it writes a migration history entry per call, so `db diff`/`db pull` later produce empty or conflicting diffs. Use `apply_migration` exactly once per task, with settled SQL.
- **Every column named in a policy gets an index.**
- **Migration files are authored by hand** into `supabase/migrations/<UTC timestamp>_<snake_name>.sql` using the CLI's own naming format (`YYYYMMDDHHMMSS`), and the same SQL is applied via `apply_migration` with a matching snake_case name. The repo is the source of truth; a later CLI install reconciles against it.

---

## Prerequisite (human, one time)

**Anonymous sign-ins must be enabled** in the Supabase dashboard: Authentication → Sign In / Providers → Anonymous sign-ins → on. The entire identity model depends on it and it is off by default. Nothing in this plan works without it, but nothing in this plan *tests* it either — that lands in Plan 2 with the client.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_reference_tables.sql` | Zones, centres, POIs, hazards — the read-only reference data |
| `supabase/migrations/<ts>_identity.sql` | `profiles`, the `auth.users` trigger, `private.is_operator()` |
| `supabase/migrations/<ts>_alerts.sql` | `alerts` + the one-active-per-zone invariant |
| `supabase/migrations/<ts>_community.sql` | Reports, pins, votes, check-ins |
| `supabase/tests/rls.sql` | The denial suite — the security boundary's regression tests |
| `supabase/tests/helpers.sql` | `tests.as_user` / `tests.as_anon` / `tests.expect_denied` / `tests.expect_allowed` |
| `supabase/seed/seed.sql` | Generated from `src/lib/mock-data/` by the script below |
| `scripts/generate-seed.ts` | Reads mock-data, writes `seed.sql` — keeps one source of truth |

---

### Task 1: Reference tables

The four tables nothing writes from a client. Getting these right first means every later task has real foreign keys to point at.

**Files:**
- Create: `supabase/migrations/<ts>_reference_tables.sql`

**Interfaces:**
- Consumes: nothing
- Produces: tables `public.zones (id text pk)`, `public.evacuation_centers (id text pk, zone_id text unique)`, `public.points_of_interest (id text pk)`, `public.hazard_susceptibility (id text pk)`. Later tasks reference `public.zones (id)`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/reference-tables.sql`. This asserts the tables exist and are locked down. Run it before the migration and it fails on the first missing table.

```sql
begin;

do $$
begin
  if to_regclass('public.zones') is null then
    raise exception using errcode = 'TSTFL', message = 'public.zones does not exist';
  end if;
  if to_regclass('public.evacuation_centers') is null then
    raise exception using errcode = 'TSTFL', message = 'public.evacuation_centers does not exist';
  end if;
  if to_regclass('public.points_of_interest') is null then
    raise exception using errcode = 'TSTFL', message = 'public.points_of_interest does not exist';
  end if;
  if to_regclass('public.hazard_susceptibility') is null then
    raise exception using errcode = 'TSTFL', message = 'public.hazard_susceptibility does not exist';
  end if;
end $$;

-- RLS must be on. A table in public without RLS is world-writable via the Data API.
do $$
declare unprotected text;
begin
  select string_agg(relname, ', ') into unprotected
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if unprotected is not null then
    raise exception using errcode = 'TSTFL',
      message = format('tables in public without RLS: %s', unprotected);
  end if;
end $$;

rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Use MCP `execute_sql` with `project_id: keoxneujsebuedqbmqxz` and the file's contents.
Expected: error `public.zones does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260905120000_reference_tables.sql`:

```sql
create table public.zones (
  id                     text primary key,
  psgc_barangay_code     text not null,
  name                   text not null,
  evacuation_route_text  jsonb not null,
  lat                    double precision not null,
  lng                    double precision not null,
  evacuation_route_path  jsonb not null,
  hotline_number         text not null,
  downstream_zone_id     text references public.zones (id)
);

create table public.evacuation_centers (
  id                text primary key,
  zone_id           text not null unique references public.zones (id),
  name              text not null,
  lat               double precision not null,
  lng               double precision not null,
  capacity          integer not null check (capacity > 0),
  status            text not null default 'space_available'
                      check (status in ('space_available','limited','full')),
  current_occupancy integer check (current_occupancy >= 0)
);

create table public.points_of_interest (
  id       text primary key,
  zone_id  text not null references public.zones (id),
  category text not null check (category in
             ('health_center','pharmacy','market','water_station','barangay_office')),
  name     text not null,
  lat      double precision not null,
  lng      double precision not null
);

create table public.hazard_susceptibility (
  id          text primary key,
  zone_id     text not null references public.zones (id),
  hazard_type text not null check (hazard_type in ('flood','landslide','storm_surge')),
  risk_level  text not null check (risk_level in ('low','medium','high')),
  unique (zone_id, hazard_type)
);

-- Foreign keys are not indexed automatically, and every one of these is a join column.
create index zones_downstream_zone_id_idx     on public.zones (downstream_zone_id);
create index points_of_interest_zone_id_idx   on public.points_of_interest (zone_id);
create index hazard_susceptibility_zone_id_idx on public.hazard_susceptibility (zone_id);

alter table public.zones                 enable row level security;
alter table public.evacuation_centers    enable row level security;
alter table public.points_of_interest    enable row level security;
alter table public.hazard_susceptibility enable row level security;

-- Reachability through the Data API is separate from RLS and is not automatic.
grant select on public.zones, public.evacuation_centers,
                public.points_of_interest, public.hazard_susceptibility
  to anon, authenticated;

-- Read-only to the world. No insert/update/delete policy exists, so all writes
-- are denied for anon and authenticated regardless of the grant above.
create policy zones_read on public.zones
  for select to anon, authenticated using (true);
create policy centers_read on public.evacuation_centers
  for select to anon, authenticated using (true);
create policy pois_read on public.points_of_interest
  for select to anon, authenticated using (true);
create policy hazards_read on public.hazard_susceptibility
  for select to anon, authenticated using (true);
```

- [ ] **Step 4: Apply it**

MCP `apply_migration` with `project_id: keoxneujsebuedqbmqxz`, `name: reference_tables`, `query:` the file contents.

- [ ] **Step 5: Run the test to verify it passes**

MCP `execute_sql` with `supabase/tests/reference-tables.sql`.
Expected: no error.

- [ ] **Step 6: Verify writes are actually denied**

MCP `execute_sql`:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.zones (id, psgc_barangay_code, name, evacuation_route_text,
                          lat, lng, evacuation_route_path, hotline_number)
values ('hax', '0', 'x', '{}'::jsonb, 0, 0, '[]'::jsonb, '0');
rollback;
```

Expected: `new row violates row-level security policy for table "zones"` (SQLSTATE 42501).
If this **succeeds**, stop — the read-only guarantee is broken and Task 1 is not done.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(db): add reference tables with RLS and read-only policies"
```

---

### Task 2: Identity, and the operator check

Also resolves the spec's one open question: whether a policy can call a function the querying role lacks `EXECUTE` on. **Plan 2's policies depend on the answer, so record it in the plan file.**

**Files:**
- Create: `supabase/migrations/<ts>_identity.sql`, `supabase/tests/helpers.sql`

**Interfaces:**
- Consumes: `public.zones (id)` from Task 1
- Produces: `public.profiles (id uuid pk, role text, zone_id text)`; `private.is_operator() returns boolean`; test helpers `tests.as_user(uuid)`, `tests.as_anon()`, `tests.expect_denied(text, text)`, `tests.expect_allowed(text, text)`

- [ ] **Step 1: Write the test helpers**

Create `supabase/tests/helpers.sql`. Every later task uses these, so they are part of this task's deliverable.

```sql
create schema if not exists tests;

-- Impersonate a signed-in user. The uuid need not exist in auth.users for RLS
-- to evaluate (select auth.uid()) — only for foreign keys to be satisfiable.
create or replace function tests.as_user(user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text, true);
end $$;

create or replace function tests.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

-- Asserts a statement is refused. The sentinel errcode TSTFL is deliberately
-- not handled below, so a test that wrongly succeeds propagates and fails loudly
-- rather than being swallowed by its own handler.
create or replace function tests.expect_denied(label text, stmt text) returns void
language plpgsql as $$
begin
  execute stmt;
  raise exception using errcode = 'TSTFL',
    message = format('SECURITY TEST FAILED — expected denial, statement succeeded: %s', label);
exception
  when insufficient_privilege then
    raise notice 'ok, denied: %', label;
end $$;

create or replace function tests.expect_allowed(label text, stmt text) returns void
language plpgsql as $$
begin
  execute stmt;
  raise notice 'ok, allowed: %', label;
exception
  when insufficient_privilege then
    raise exception using errcode = 'TSTFL',
      message = format('TEST FAILED — expected success, was denied: %s', label);
end $$;

revoke all on schema tests from public, anon, authenticated;
```

- [ ] **Step 2: Write the failing test**

Append to `supabase/tests/rls.sql` (create it):

```sql
begin;

-- A resident must never be able to promote themselves.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'resident cannot set their own role to operator',
  $$update public.profiles set role = 'operator'
    where id = '11111111-1111-1111-1111-111111111111'$$);

-- The operator check must not be a public endpoint.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'authenticated cannot call private.is_operator() directly',
  $$select private.is_operator()$$);

rollback;
```

- [ ] **Step 3: Run it to verify it fails**

MCP `execute_sql` with `helpers.sql` first, then `rls.sql`.
Expected: fails — `relation "public.profiles" does not exist`.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260905120100_identity.sql`:

```sql
create schema if not exists private;

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'resident' check (role in ('resident','operator')),
  zone_id    text references public.zones (id),
  created_at timestamptz not null default now()
);

create index profiles_zone_id_idx on public.profiles (zone_id);

-- Every auth user gets a profile. Anonymous sign-ins go through auth.users too,
-- so this covers guests as well as account holders.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- No identity argument: it reads auth.uid() itself, so there is no uuid to
-- probe and therefore no way to enumerate operators.
create or replace function private.is_operator() returns boolean
language sql security definer set search_path = '' stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'operator'
  );
$$;

revoke execute on function private.is_operator()
  from public, anon, authenticated, service_role;

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;

create policy profiles_read_own_or_operator on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select private.is_operator()));

-- Deliberately no insert or update policy: role is not self-assignable, which
-- is the entire point of having a role.
```

- [ ] **Step 5: Apply it**

MCP `apply_migration`, `name: identity`.

- [ ] **Step 6: Run the test to verify it passes**

Expected: both assertions pass.

**If `expect_denied('authenticated cannot call private.is_operator() directly')` passes but Task 3's policies later fail with "permission denied for function is_operator", the revoke is too aggressive.** Record which happened:

- [ ] **Step 7: Record the answer to the open question**

Append to this plan file under a `## Resolved` heading, one line: either
`private.is_operator() revoked from authenticated — policies still evaluate. Keep the revoke.`
or
`Revoking from authenticated breaks policy evaluation. Revoke from anon and public only; the no-argument signature is what prevents enumeration.`

Plan 2 reads this line.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations supabase/tests docs/superpowers/plans
git commit -m "feat(db): add profiles, the new-user trigger, and the operator check"
```

---

### Task 3: Alerts

The table the whole product exists to serve, and the one whose invariant replaces a pile of client-side merge logic.

**Files:**
- Create: `supabase/migrations/<ts>_alerts.sql`
- Modify: `supabase/tests/rls.sql`

**Interfaces:**
- Consumes: `public.zones (id)`, `private.is_operator()`
- Produces: `public.alerts` with `superseded_severity` — the column Plan 2's layer 9 downgrade notice reads

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/rls.sql`, before the closing `rollback;`:

```sql
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'resident cannot issue an alert',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('zone-1', 'evacuate', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

select tests.as_anon();
select tests.expect_denied(
  'anonymous role cannot issue an alert',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('zone-1', 'evacuate', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);
```

And a plain assertion that the one-active invariant is enforced by the database, not by convention:

```sql
do $$
begin
  set local role postgres;
  insert into public.alerts (zone_id, severity, message, source)
    values ('zone-1','red','{"en":"a","fil":"a"}'::jsonb,'manual');
  begin
    insert into public.alerts (zone_id, severity, message, source)
      values ('zone-1','yellow','{"en":"b","fil":"b"}'::jsonb,'manual');
    raise exception using errcode = 'TSTFL',
      message = 'two active alerts were allowed for one zone';
  exception
    when unique_violation then raise notice 'ok: one active alert per zone enforced';
  end;
end $$;
```

- [ ] **Step 2: Run it to verify it fails**

Expected: `relation "public.alerts" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260905120200_alerts.sql`:

```sql
create table public.alerts (
  id                  uuid primary key default gen_random_uuid(),
  zone_id             text not null references public.zones (id),
  severity            text not null check (severity in ('yellow','orange','red','evacuate')),
  message             jsonb not null,
  source              text not null check (source in
                        ('manual','auto_crowdsourced','predicted','cascade')),
  confidence          text not null default 'estimated'
                        check (confidence in ('estimated','validated','calibrated')),
  predicted_timing    jsonb,
  issued_at           timestamptz not null default now(),
  issued_by           uuid references auth.users (id),
  is_active           boolean not null default true,
  superseded_at       timestamptz,
  -- The severity this row replaced. Lets the downgrade notice read one row
  -- instead of walking history.
  superseded_severity text check (superseded_severity in
                        ('yellow','orange','red','evacuate'))
);

-- The invariant the client's resolveEffectiveAlert used to emulate.
create unique index alerts_one_active_per_zone on public.alerts (zone_id) where is_active;

-- Reads are "active alerts, plus recently superseded ones for the notice".
create index alerts_zone_superseded_idx on public.alerts (zone_id, superseded_at desc)
  where superseded_at is not null;

alter table public.alerts enable row level security;
grant select on public.alerts to anon, authenticated;
grant insert, update on public.alerts to authenticated;

create policy alerts_read on public.alerts
  for select to anon, authenticated using (true);

create policy alerts_write_operator on public.alerts
  for insert to authenticated
  with check ((select private.is_operator()));

create policy alerts_update_operator on public.alerts
  for update to authenticated
  using      ((select private.is_operator()))
  with check ((select private.is_operator()));
```

- [ ] **Step 4: Apply it**

MCP `apply_migration`, `name: alerts`.

- [ ] **Step 5: Run the test to verify it passes**

Expected: all three assertions pass. If the two operator policies error with "permission denied for function is_operator", go back to Task 2 Step 7 and take the fallback.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(db): add alerts with a one-active-per-zone invariant"
```

---

### Task 4: Community tables

Reports, pins, votes and check-ins — everything a resident writes. This is where the `WITH CHECK` trap and the check-in privacy boundary get proven.

**Files:**
- Create: `supabase/migrations/<ts>_community.sql`
- Modify: `supabase/tests/rls.sql`

**Interfaces:**
- Consumes: `public.zones (id)`, `private.is_operator()`
- Produces: `public.water_level_reports`, `public.community_pins`, `public.pin_votes`, `public.evacuation_check_ins`

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/rls.sql`. Each assertion corresponds to a named trap in the spec:

```sql
-- Ownership: you cannot file a report as someone else.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'resident cannot file a report attributed to another user',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id)
    values ('zone-1', 'knee', '22222222-2222-2222-2222-222222222222')$$);

-- The WITH CHECK trap: passing USING on the way in, then reassigning on the way out.
select tests.expect_denied(
  'resident cannot reassign their own pin to another author',
  $$update public.community_pins
      set author_id = '22222222-2222-2222-2222-222222222222'
    where author_id = '11111111-1111-1111-1111-111111111111'$$);

-- Check-ins name a person and say whether they need help.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'resident cannot record a check-in as another user',
  $$insert into public.evacuation_check_ins (zone_id, user_id, status)
    values ('zone-1', '22222222-2222-2222-2222-222222222222', 'needs_help')$$);

-- A resident reading another resident's check-in must return zero rows, not an error.
do $$
declare visible int;
begin
  perform tests.as_user('11111111-1111-1111-1111-111111111111');
  select count(*) into visible from public.evacuation_check_ins
    where user_id = '22222222-2222-2222-2222-222222222222';
  if visible <> 0 then
    raise exception using errcode = 'TSTFL',
      message = 'a resident could see another resident''s check-in';
  end if;
  raise notice 'ok: check-ins are not readable across residents';
end $$;
```

- [ ] **Step 2: Run it to verify it fails**

Expected: `relation "public.water_level_reports" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260905120300_community.sql`:

```sql
create table public.water_level_reports (
  id           uuid primary key default gen_random_uuid(),
  zone_id      text not null references public.zones (id),
  depth_level  text not null check (depth_level in ('dry','ankle','knee','waist','neck')),
  reporter_id  uuid not null references auth.users (id),
  reported_at  timestamptz not null default now(),
  trust_weight numeric not null default 1.0,
  is_outlier   boolean not null default false
);

create table public.community_pins (
  id             uuid primary key default gen_random_uuid(),
  zone_id        text not null references public.zones (id),
  status_tag     text not null,
  caption        text not null,
  photo_path     text,
  lat            double precision not null,
  lng            double precision not null,
  author_id      uuid not null references auth.users (id),
  created_at     timestamptz not null default now(),
  removed        boolean not null default false,
  removed_reason text check (removed_reason in ('net_score','admin'))
);

create table public.pin_votes (
  pin_id    uuid not null references public.community_pins (id) on delete cascade,
  voter_id  uuid not null references auth.users (id),
  direction smallint not null check (direction in (1, -1)),
  voted_at  timestamptz not null default now(),
  primary key (pin_id, voter_id)
);

create table public.evacuation_check_ins (
  id            uuid primary key default gen_random_uuid(),
  zone_id       text not null references public.zones (id),
  user_id       uuid not null references auth.users (id),
  status        text not null check (status in ('safe','needs_help')),
  checked_in_at timestamptz not null default now(),
  unique (zone_id, user_id)
);

-- Every column a policy or a common filter names.
create index water_level_reports_reporter_id_idx on public.water_level_reports (reporter_id);
create index water_level_reports_zone_time_idx   on public.water_level_reports (zone_id, reported_at desc);
create index community_pins_author_id_idx        on public.community_pins (author_id);
create index community_pins_zone_idx             on public.community_pins (zone_id) where not removed;
create index pin_votes_voter_id_idx              on public.pin_votes (voter_id);
create index evacuation_check_ins_user_id_idx    on public.evacuation_check_ins (user_id);
create index evacuation_check_ins_zone_id_idx    on public.evacuation_check_ins (zone_id);

alter table public.water_level_reports  enable row level security;
alter table public.community_pins       enable row level security;
alter table public.pin_votes            enable row level security;
alter table public.evacuation_check_ins enable row level security;

grant select on public.water_level_reports, public.community_pins, public.pin_votes
  to anon, authenticated;
grant insert on public.water_level_reports to authenticated;
grant insert, update on public.community_pins, public.pin_votes to authenticated;
grant select, insert, update on public.evacuation_check_ins to authenticated;

create policy reports_read on public.water_level_reports
  for select to anon, authenticated using (true);
create policy reports_insert_own on public.water_level_reports
  for insert to authenticated with check ((select auth.uid()) = reporter_id);
-- No update or delete: a report is a historical observation.

create policy pins_read on public.community_pins
  for select to anon, authenticated using (true);
create policy pins_insert_own on public.community_pins
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy pins_update_own_or_operator on public.community_pins
  for update to authenticated
  using      ((select auth.uid()) = author_id or (select private.is_operator()))
  with check ((select auth.uid()) = author_id or (select private.is_operator()));
-- No delete: removal is the soft-delete flag, so restore stays possible.

create policy votes_read on public.pin_votes
  for select to anon, authenticated using (true);
create policy votes_insert_own on public.pin_votes
  for insert to authenticated with check ((select auth.uid()) = voter_id);
create policy votes_update_own on public.pin_votes
  for update to authenticated
  using      ((select auth.uid()) = voter_id)
  with check ((select auth.uid()) = voter_id);

-- Not world-readable: a check-in names a person and says whether they need help.
create policy checkins_read_own_or_operator on public.evacuation_check_ins
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_operator()));
create policy checkins_insert_own on public.evacuation_check_ins
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy checkins_update_own on public.evacuation_check_ins
  for update to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

- [ ] **Step 4: Apply it**

MCP `apply_migration`, `name: community`.

- [ ] **Step 5: Run the test to verify it passes**

Expected: all four assertions pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(db): add community tables with ownership-scoped RLS"
```

---

### Task 5: Seed from mock-data

`src/lib/mock-data/` stays the single source of truth. Hand-copying it into SQL would create a second one that silently drifts.

**Files:**
- Create: `scripts/generate-seed.ts`, `supabase/seed/seed.sql` (generated)
- Modify: `package.json` (add `db:seed:generate`)

**Interfaces:**
- Consumes: `MOCK_ZONES`, `MOCK_POIS`, `MOCK_HAZARD_SUSCEPTIBILITY` from `src/lib/mock-data`
- Produces: `supabase/seed/seed.sql`, idempotent, safe to re-run

- [ ] **Step 1: Write the failing test**

Create `scripts/generate-seed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSeedSql } from "./generate-seed";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("buildSeedSql", () => {
  it("emits one zone row per mock zone", () => {
    const sql = buildSeedSql();
    for (const zone of MOCK_ZONES) {
      expect(sql).toContain(`'${zone.id}'`);
    }
  });

  it("is idempotent, so re-seeding a pilot database is not destructive", () => {
    expect(buildSeedSql()).toContain("on conflict (id) do update");
  });

  it("escapes apostrophes, which Filipino route text contains", () => {
    // A single unescaped quote turns the seed into a SQL syntax error at best
    // and an injection at worst.
    const sql = buildSeedSql();
    expect(sql).not.toMatch(/[^']'[^',)]/);
  });

  it("marks every seeded row so a pilot can delete demo data", () => {
    expect(buildSeedSql()).toContain("-- weatherwell-seed");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run scripts/generate-seed.test.ts
```
Expected: FAIL — cannot resolve `./generate-seed`.

- [ ] **Step 3: Write the generator**

Create `scripts/generate-seed.ts`. `quote()` is the only security-relevant line in the file:

```ts
import { writeFileSync } from "node:fs";
import { MOCK_ZONES, MOCK_POIS, MOCK_HAZARD_SUSCEPTIBILITY } from "../src/lib/mock-data";

/** Postgres string literal. Doubling the apostrophe is the whole escape. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function json(value: unknown): string {
  return `${quote(JSON.stringify(value))}::jsonb`;
}

export function buildSeedSql(): string {
  const lines: string[] = ["-- weatherwell-seed — generated by scripts/generate-seed.ts", ""];

  // Zones first: everything else references them. downstream_zone_id is set in a
  // second pass so the insert order cannot violate the self-reference.
  for (const z of MOCK_ZONES) {
    lines.push(
      `insert into public.zones (id, psgc_barangay_code, name, evacuation_route_text,` +
        ` lat, lng, evacuation_route_path, hotline_number) values (` +
        `${quote(z.id)}, ${quote(z.psgcBarangayCode)}, ${quote(z.name)},` +
        ` ${json(z.evacuationRouteText)}, ${z.lat}, ${z.lng},` +
        ` ${json(z.evacuationRoutePath)}, ${quote(z.hotlineNumber)})` +
        ` on conflict (id) do update set name = excluded.name,` +
        ` evacuation_route_text = excluded.evacuation_route_text,` +
        ` evacuation_route_path = excluded.evacuation_route_path;`
    );
  }
  for (const z of MOCK_ZONES) {
    if (z.downstreamZoneId) {
      lines.push(
        `update public.zones set downstream_zone_id = ${quote(z.downstreamZoneId)}` +
          ` where id = ${quote(z.id)};`
      );
    }
  }

  for (const z of MOCK_ZONES) {
    lines.push(
      `insert into public.evacuation_centers (id, zone_id, name, lat, lng, capacity, status)` +
        ` values (${quote(`center-${z.id}`)}, ${quote(z.id)}, ${quote(z.evacuationCenterName)},` +
        ` ${z.evacuationCenterLat}, ${z.evacuationCenterLng}, ${z.evacuationCenterCapacity},` +
        ` ${quote(z.centerStatus)})` +
        ` on conflict (id) do update set name = excluded.name,` +
        ` capacity = excluded.capacity, status = excluded.status;`
    );
  }

  for (const p of MOCK_POIS) {
    lines.push(
      `insert into public.points_of_interest (id, zone_id, category, name, lat, lng) values (` +
        `${quote(p.id)}, ${quote(p.zoneId)}, ${quote(p.category)}, ${quote(p.name)},` +
        ` ${p.lat}, ${p.lng}) on conflict (id) do update set name = excluded.name;`
    );
  }

  for (const [zoneId, byType] of Object.entries(MOCK_HAZARD_SUSCEPTIBILITY)) {
    for (const [hazardType, riskLevel] of Object.entries(byType)) {
      lines.push(
        `insert into public.hazard_susceptibility (id, zone_id, hazard_type, risk_level) values (` +
          `${quote(`${zoneId}-${hazardType}`)}, ${quote(zoneId)}, ${quote(hazardType)},` +
          ` ${quote(riskLevel)}) on conflict (id) do update set risk_level = excluded.risk_level;`
      );
    }
  }

  return lines.join("\n") + "\n";
}

// Only write the file when run directly, so importing this in a test is side-effect free.
if (process.argv[1]?.endsWith("generate-seed.ts")) {
  writeFileSync("supabase/seed/seed.sql", buildSeedSql());
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run scripts/generate-seed.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Install the runner, then generate and apply the seed**

`tsx` is not currently a dependency; it is what lets a TypeScript script that imports from `src/` run directly.

```bash
npm install --save-dev tsx
mkdir -p supabase/seed
npx tsx scripts/generate-seed.ts
```

Then MCP `execute_sql` with the contents of `supabase/seed/seed.sql`.

If `tsx` cannot resolve the `@/lib/mock-data` path alias, use the relative import already written in `generate-seed.ts` (`../src/lib/mock-data`) — the script deliberately uses relative paths for exactly this reason, and only the *test* file uses the alias, where Vitest resolves it.

- [ ] **Step 6: Verify the seed landed**

MCP `execute_sql`:

```sql
select
  (select count(*) from public.zones)                 as zones,
  (select count(*) from public.evacuation_centers)    as centers,
  (select count(*) from public.points_of_interest)    as pois,
  (select count(*) from public.hazard_susceptibility) as hazards,
  (select count(*) from public.zones where downstream_zone_id is not null) as cascades;
```

Expected: `zones = 4`, `centers = 4`, `pois` matches `MOCK_POIS.length`, `hazards = 12` (4 zones × 3 hazard types), `cascades = 3`.

- [ ] **Step 7: Add the script and commit**

Add to `package.json` scripts: `"db:seed:generate": "tsx scripts/generate-seed.ts"`.

Then confirm the new script and test file have not disturbed the existing gates — `knip` in particular will flag `scripts/generate-seed.ts` as an unused entry point unless it is declared:

```bash
npx knip
```

If knip reports it, add `"scripts/generate-seed.ts"` to the `entry` array in `knip.jsonc` (which already lists `public/sw.js` for the same reason).

```bash
npm run lint && npm run typecheck && npx vitest run
git add scripts supabase/seed package.json package-lock.json knip.jsonc
git commit -m "feat(db): generate the seed from mock-data rather than duplicating it"
```

Expected: lint clean, typecheck clean, **368 tests passing** — the existing 364 plus this task's 4.

---

### Task 6: Advisors sweep and the full denial suite

The database is only done when Supabase's own security advisor agrees, and when the whole denial suite runs green in one pass rather than task by task.

**Files:**
- Modify: `supabase/tests/rls.sql`
- Create: `docs/superpowers/plans/2026-09-05-v0-database-foundation.md` → `## Resolved` section (from Task 2)

- [ ] **Step 1: Run the security advisor**

MCP `get_advisors` with `project_id: keoxneujsebuedqbmqxz`, `type: security`.

- [ ] **Step 2: Fix everything it reports**

Expected findings and their responses:
- *"RLS disabled in public"* — a real bug. Enable it. Nothing in `public` is exempt.
- *"Function search_path mutable"* — a real bug on any function missing `set search_path = ''`. Fix it.
- *"Security definer view"* — a real bug. Add `with (security_invoker = true)`.
- *"Leaked password protection disabled"* — not applicable to this slice (no password accounts yet); note it and move on.

Re-run until clean or every remaining item is explained in writing.

- [ ] **Step 3: Run the performance advisor**

MCP `get_advisors`, `type: performance`.
Expected: *"Auth RLS initplan"* warnings are the signal that a policy uses bare `auth.uid()`. There should be **none** — every policy in this plan wraps it. Any warning here is a policy that missed the rule; fix it.

- [ ] **Step 4: Run the whole denial suite in one pass**

MCP `execute_sql` with `helpers.sql`, then the complete `rls.sql`.
Expected: every `ok, denied:` / `ok:` notice present, no `TSTFL` error.

- [ ] **Step 5: Confirm the table inventory matches the spec**

MCP `list_tables` with `schemas: ["public"]`.
Expected exactly: `zones`, `evacuation_centers`, `points_of_interest`, `hazard_susceptibility`, `profiles`, `alerts`, `water_level_reports`, `community_pins`, `pin_votes`, `evacuation_check_ins`. Ten tables, no more.

- [ ] **Step 6: Confirm migration history matches the repo**

MCP `list_migrations`.
Expected: four entries — `reference_tables`, `identity`, `alerts`, `community` — in that order, matching the four files in `supabase/migrations/`. If they diverge, the repo wins; reconcile by hand and note it.

- [ ] **Step 7: Commit**

```bash
git add supabase docs/superpowers/plans
git commit -m "test(db): prove the RLS denials and clear the security advisor"
git push origin v0
```

---

## Self-Review

**Spec coverage.** Every schema table in the spec has a task: reference (1), profiles (2), alerts (3), community (4). RLS policies: 1–4, proven in 6. `private.is_operator()` hardening: 2. Seeding: 5. Advisors and the schema-change workflow: 6. Data API grants: every migration task.

**Deferred to Plan 2, deliberately, and named here so the gap is visible rather than lost:** the five route handlers, the `sw.js` `/api/` branch and `no-store` for check-ins, `useZones`, the outbox, all eight Server Actions, the four store migrations, the `zone-overrides` collapse, `device-id` deletion, the layer 9 re-point, the 23-file import switch, component-test churn, and CI's Supabase container. Plan 1 changes **no application code**, so `npm test` must still report 364 passing at the end of it.

**Type consistency.** `private.is_operator()` takes no argument in Tasks 2, 3 and 4. `superseded_severity` is spelled identically in Task 3 and in the spec's layer 9 section. Seed centre ids are `center-<zoneId>`, used only in Task 5. `tests.expect_denied(label, stmt)` has the same signature everywhere.

**Known fragility.** Task 4's denial tests insert rows referencing uuids that do not exist in `auth.users`. RLS `WITH CHECK` is evaluated before foreign keys, so these fail with `insufficient_privilege` as expected — but if any assertion instead reports `foreign_key_violation`, the test proved nothing and must be rewritten against a real seeded auth user. Watch for that error specifically in Task 4 Step 5.

---

## Resolved

*(Task 2 Step 7 writes one line here. Plan 2 reads it.)*
