# Admin Role, In-App Official Appointment, and Password Sign-In — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third `profiles.role` value (`admin`, system-wide) with an in-app UI to appoint/remove officials, restore password sign-in and sign-up (removed earlier this session), and create three real test accounts — `admin@weatherwell.com`, `official@weatherwell.com`, `user@weatherwell.com` — in the live production Supabase project.

**Architecture:** Two functions (`private.is_operator()`, `private.manages_zone()`) already gate every official-only RLS policy in this database — widening those two to also accept `role = 'admin'` gives admin everything an official already has, everywhere, for free. A new pair of `SECURITY DEFINER` functions, gated on `role = 'admin'`, delegate to the existing (still superuser-only) appointment commands, so the original lockdown is never loosened — this is a new, separate, audited path. Password auth is restored from `git show f06fc75^` (the exact code Task 4 removed this session), adapted for the current file shape.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres RLS + Auth), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-22-admin-role-and-password-auth-design.md` (amends `docs/superpowers/specs/2026-09-11-v0-officials-and-roles-design.md`). Read both — the amendment doc explains *why* each decision below was made, including one bug found and fixed during its own self-review (the audit-log attribution fix in Task 1).

## Global Constraints

- This plan's database changes and the three test accounts apply to the **live production Supabase project** — there is no separate staging environment for this codebase. Treat every migration and every account-creation step as real.
- Nobody can appoint or create a new **admin** from inside the app, ever, in any task in this plan. Admins are created only by you, directly, in Supabase. If a task's implementation would make that possible, stop and flag it — it is not part of this plan.
- An admin's `profiles.area_code` stays `NULL` in the database. In TypeScript (`Official.areaCode: string`, non-optional), an admin is represented as `areaCode: ""` — chosen deliberately because `"".startsWith("")` and every barangay code `.startsWith("")` are both `true`, so the existing presentation-only `isInArea()` check (`src/lib/auth/official.ts`) already treats an admin as managing every zone with zero code changes.
- Every new user-facing string is a `LocalizedText` (`{ en, fil }`), passed through `t(...)`, matching every existing string in this codebase — no bare strings shown to a resident or official.
- New buttons that are a primary action (submit, remove) use the `Button` component's `size="lg"` (this app's established 44px touch-target size — see `src/components/ui/button.tsx`'s own comment on `lg`), not `size="sm"`.
- No new npm dependencies. Everything needed (`@supabase/supabase-js`, `tsx`) is already in `package.json`.
- Before writing any `DROP CONSTRAINT` statement, verify the real constraint name against the live database first (Task 1, Step 1) — never guess a Postgres auto-generated constraint name.
- The exact code for `signInWithPassword`, `signUpWithPassword`, and their tests already exists in git history (`git show f06fc75^:src/lib/auth/sign-in.ts` and `git show f06fc75^:src/lib/auth/sign-in.test.ts`) — restore it, don't reinvent it. Only the magic-link half of that history is deliberately left out (never worked here — no SMTP — and wasn't requested).

## Review Focus

- A non-admin (official or resident) hitting `/admin/officials` directly by URL, or calling `appointOfficial`/`removeOfficial` directly (not through the UI) — must be refused server-side by the database's own role check, not merely hidden from navigation. (Task 1's RLS tests, Task 3's Server Action tests)
- Appointing an email that has never signed into the app — `appoint_official`'s real error ("No account for %. Ask them to sign in once first.") must reach the admin through the new form, not collapse into a generic "failed" message. (Task 4)
- Appointing an ambiguous or unrecognized area name — same: the real database error text (e.g. "Ambiguous: "%" matches %.") must surface, not be swallowed. (Task 4)
- `loadOfficial()` must never run the zone/municipality name lookup for an admin — `area_code` is `NULL`, and a Postgrest `.eq(col, null)` filter can only ever return zero rows, so attempting it would be dead code that always resolves to the raw-code fallback instead of a clean "All areas" label. (Task 2)
- Self-serve password sign-up when the email already belongs to an existing (e.g. Google-linked) account must not silently create a broken duplicate — this exact behavior was already proven correct in the removed test suite (`EMAIL_TAKEN_CODES` handling in `signUpWithPassword`); Task 5 restores it faithfully rather than re-deriving it. (Task 5)

---

### Task 1: Database — admin role, widened gates, and the appoint/remove-officials RPCs

**Files:**
- Create: `supabase/migrations/<timestamp>_admin_role.sql` (timestamp: run `date -u +%Y%m%d%H%M%S` immediately before writing the filename, so it sorts after every existing migration)
- Modify: `supabase/tests/rls.sql`

**Interfaces:**
- Consumes: nothing from an earlier task (this is the first task).
- Produces: `private.admin_appoint_official(p_email text, p_area text, p_display_name text) returns text`, `private.admin_remove_official(p_email text) returns text` — both `security definer`, granted `execute` to `authenticated`, gated internally on the caller's `profiles.role = 'admin'`. Task 3's Server Actions call these two by exact name, with exactly these three/one parameters. `profiles.role` now also accepts `'admin'`.

- [ ] **Step 1: Find the real constraint name — do not guess it**

Run via the Supabase MCP `execute_sql` tool:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c';
```

Expected: three rows — the `role` check (`role in ('resident'::text, 'operator'::text)` or similar), `area_code`'s regex check, and `operator_has_area_and_name`. Note the exact `conname` of the `role` check (almost certainly `profiles_role_check`, but this step exists precisely because "almost certainly" is not good enough for a live `DROP CONSTRAINT`). Use that exact name in Step 2.

- [ ] **Step 2: Write the migration**

```sql
-- Admin role: system-wide, above official. See
-- docs/superpowers/specs/2026-09-22-admin-role-and-password-auth-design.md
-- for the full reasoning; this migration is that design's Task 1.

-- 1. Widen the role check constraint. <exact conname from Step 1> is
--    dropped and re-added rather than altered in place — Postgres has no
--    ALTER for a CHECK constraint's condition.
alter table public.profiles drop constraint <exact conname from Step 1>;
alter table public.profiles add constraint profiles_role_check
  check (role in ('resident', 'operator', 'admin'));

-- 2. An admin needs a display_name for the action-record actor field,
--    exactly like an official already does — but never an area_code
--    (an admin is system-wide by definition; area_code stays NULL).
alter table public.profiles add constraint admin_has_name
  check (role <> 'admin' or display_name is not null);

-- 3. private.is_operator(): the coarse "is this person any kind of
--    official" check, used by every RLS policy that does not care WHICH
--    area — community pin moderation, check-in reads, official_actions
--    reads, official marker writes. An admin passes every one of these
--    for free the moment this one function does.
create or replace function private.is_operator() returns boolean
language sql security definer set search_path = '' stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('operator', 'admin')
  );
$$;

-- 4. private.manages_zone(p_zone_id): the fine-grained "is this person
--    the official for THIS zone" check behind alert writes, evacuation
--    centre updates, pin-moderation-column writes. An admin manages every
--    zone; the OR below is the entire mechanism, no area_code comparison
--    needed for the admin branch.
create or replace function private.manages_zone(p_zone_id text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.zones z on z.id = p_zone_id
    where p.id = (select auth.uid())
      and (
        (p.role = 'operator' and z.psgc_barangay_code like p.area_code || '%')
        or p.role = 'admin'
      )
  );
$$;

-- 5. record_official_action's actor lookup must recognise an admin's own
--    profile row too, or an admin-driven appointment falls through to
--    "Not an official" instead of the admin's real name.
create or replace function private.record_official_action(
  p_action         text,
  p_zone_id        text,
  p_target_id      text,
  p_detail         jsonb,
  p_actor_override text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text;
  v_area text;
begin
  if p_actor_override is not null then
    v_uid  := null;
    v_name := p_actor_override;
  elsif v_uid is null then
    v_name := 'System owner';
  else
    select display_name, area_code into v_name, v_area
      from public.profiles where id = v_uid and role in ('operator', 'admin');
    if v_name is null then v_name := 'Not an official'; end if;
  end if;

  insert into public.official_actions
    (actor_id, actor_name, actor_area, action, zone_id, target_id, detail)
  values
    (v_uid, v_name, v_area, p_action, p_zone_id, p_target_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;

-- 6. appoint_official / remove_official: the ONLY change is the literal
--    'System owner' passed to record_official_action becomes NULL. Run
--    from the SQL editor (no auth.uid() in that context), NULL still
--    resolves to 'System owner' via record_official_action's own
--    v_uid is null branch above — unchanged behaviour for that path. Run
--    through the new admin wrapper below (a real authenticated session),
--    auth.uid() resolves to the calling admin, and the lookup just
--    widened in step 5 finds and uses their name. Everything else about
--    these two functions, including their own lockdown, is untouched —
--    this is `create or replace` on the exact bodies already live, with
--    one string replaced.
create or replace function private.appoint_official(
  p_email        text,
  p_area         text,
  p_display_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid;
  v_name     text := trim(p_display_name);
  v_area     text := trim(p_area);
  v_code     text;
  v_label    text;
  v_count    int;
  v_matches  text;
  v_barangay text;
  v_town     text;
  v_covered  text;
begin
  if coalesce(v_name, '') = '' then
    raise exception 'A display name is required, e.g. ''Juan Dela Cruz, BDRRMO Nilombot''.';
  end if;

  select id into v_user from auth.users
   where lower(email) = lower(trim(p_email)) and not is_anonymous;
  if v_user is null then
    raise exception 'No account for %. Ask them to sign in once first.', p_email;
  end if;

  if not exists (select 1 from auth.users where id = v_user and email_confirmed_at is not null) then
    raise exception 'The account for % has not confirmed its email yet. Ask them to finish signing in (open the emailed link, or complete Google sign-in), then try again.', p_email;
  end if;

  if v_area ~ '^(\d{7}|\d{10})$' then
    v_code  := v_area;
    v_label := v_area;
  elsif position(',' in v_area) > 0 then
    v_barangay := trim(split_part(v_area, ',', 1));
    v_town     := trim(split_part(v_area, ',', 2));
    select count(*), min(psgc_barangay_code), string_agg(name, '; ')
      into v_count, v_code, v_matches
      from public.zones
     where lower(name) in (lower('Barangay ' || v_barangay || ', ' || v_town),
                           lower(v_barangay || ', ' || v_town));
    if v_count = 0 then raise exception 'No barangay matches "%".', v_area; end if;
    if v_count > 1 then raise exception 'Ambiguous: "%" matches %.', v_area, v_matches; end if;
    v_label := v_barangay || ', ' || v_town;
  else
    select count(*), min(code), string_agg(name || ' (' || code || ')', '; ')
      into v_count, v_code, v_matches
      from public.municipalities where lower(name) = lower(v_area);
    if v_count = 0 then
      raise exception 'No town named "%". For a barangay use "<Barangay>, <Town>".', v_area;
    end if;
    if v_count > 1 then
      raise exception 'Ambiguous: "%" matches %. Pass the code instead.', v_area, v_matches;
    end if;
    v_label := v_area;
  end if;

  update public.profiles
     set role = 'operator', area_code = v_code, display_name = v_name
   where id = v_user;

  if not found then
    raise exception 'The account for % has no profile row, so nothing was changed. The profile-creation trigger did not run for this account; check it before appointing.', p_email;
  end if;

  select count(*), string_agg(name, '; ' order by name)
    into v_count, v_covered
    from public.zones where psgc_barangay_code like v_code || '%';

  perform private.record_official_action('official.appointed', null, v_user::text,
    jsonb_build_object('area', v_code, 'area_name', v_label, 'display_name', v_name),
    null);

  return format('%s is now an official for %s — covers %s barangay(s): %s',
                v_name, v_label, v_count, coalesce(v_covered, 'none'));
end;
$$;

create or replace function private.remove_official(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_name text;
  v_area text;
begin
  select u.id, p.display_name, p.area_code into v_user, v_name, v_area
    from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_email)) and p.role = 'operator';
  if v_user is null then
    raise exception 'No official with email %.', p_email;
  end if;

  update public.profiles
     set role = 'resident', area_code = null, display_name = null
   where id = v_user;

  perform private.record_official_action('official.removed', null, v_user::text,
    jsonb_build_object('area', v_area, 'display_name', v_name), null);

  return format('%s is no longer an official (was %s).', v_name, v_area);
end;
$$;

revoke execute on function private.appoint_official(text, text, text) from public, anon, authenticated, service_role;
revoke execute on function private.remove_official(text)             from public, anon, authenticated, service_role;

-- 7. The new, separate, admin-gated path. Neither function above had its
--    lockdown touched — these two are how an admin reaches the same
--    logic, checked on every call, not a standing grant.
create or replace function private.admin_appoint_official(
  p_email        text,
  p_area         text,
  p_display_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') then
    raise exception using errcode = '42501', message = 'only an admin may appoint officials';
  end if;
  return private.appoint_official(p_email, p_area, p_display_name);
end;
$$;

create or replace function private.admin_remove_official(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') then
    raise exception using errcode = '42501', message = 'only an admin may remove officials';
  end if;
  return private.remove_official(p_email);
end;
$$;

grant execute on function private.admin_appoint_official(text, text, text) to authenticated;
grant execute on function private.admin_remove_official(text)              to authenticated;
```

Apply it with the Supabase MCP `apply_migration` tool (name: `admin_role`, query: the SQL above with `<exact conname from Step 1>` replaced by the real value from Step 1).

- [ ] **Step 2b: Check advisors**

Run the Supabase MCP `get_advisors` tool with `type: "security"`. Expected: no new findings caused by this migration (the two new functions are `security definer` with an explicit role check inside, matching every other privileged function in this schema — if the advisor flags something new here, read what it says before continuing; it is very likely flagging something this step's own reasoning already accounts for, but confirm rather than assume).

- [ ] **Step 3: Add RLS test fixtures and assertions to `supabase/tests/rls.sql`**

Append near the end of the file (after the existing operator fixture at the `'33333333-3333-3333-3333-333333333333'` block), following the exact fixture/assertion shape already used throughout this file:

```sql
-- Admin role: an admin fixture, appointed the same way any operator
-- fixture in this file is — directly, as postgres, bypassing RLS.
do $$
declare
  admin_id uuid := '44444444-4444-4444-4444-444444444444';
begin
  insert into auth.users (id) values (admin_id);
  update public.profiles
     set role = 'admin', display_name = 'Test Admin'
   where id = admin_id;
end $$;

-- Critical: an admin manages a zone they have no area_code overlap with
-- at all (their area_code is NULL) — proving the OR branch in
-- manages_zone, not a coincidental prefix match.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'an admin CAN issue an alert for a zone with no area_code relationship to them',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('tests-fixture-zone-2', 'yellow', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

-- A plain resident must still be refused the same action, or the test
-- above would prove nothing about the admin branch specifically.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident (not admin, not operator) cannot issue an alert',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('tests-fixture-zone-2', 'red', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

-- admin_appoint_official / admin_remove_official: gated to admin only.
-- A fresh target user this block appoints and then removes, so the two
-- calls do not depend on ordering against any other fixture in this file.
insert into auth.users (id, email, is_anonymous, email_confirmed_at)
  values ('55555555-5555-5555-5555-555555555555', 'appointee@example.com', false, now());

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot call admin_appoint_official',
  $$select private.admin_appoint_official('appointee@example.com', '0105528', 'Test Appointee')$$);

select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_denied(
  'an official (not admin) cannot call admin_appoint_official',
  $$select private.admin_appoint_official('appointee@example.com', '0105528', 'Test Appointee')$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'an admin CAN call admin_appoint_official',
  $$select private.admin_appoint_official('appointee@example.com', '0105528', 'Test Appointee')$$);

do $$
declare
  observed_role text;
  observed_name text;
begin
  select role, display_name into observed_role, observed_name
    from public.profiles where id = '55555555-5555-5555-5555-555555555555';
  if observed_role is distinct from 'operator' or observed_name is distinct from 'Test Appointee' then
    raise exception using errcode = 'TSTFL',
      message = format('admin_appoint_official did not appoint correctly: role=%s name=%s', observed_role, observed_name);
  end if;
  raise notice 'ok: admin_appoint_official appointed the target correctly';
end $$;

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'an admin CAN call admin_remove_official',
  $$select private.admin_remove_official('appointee@example.com')$$);

do $$
declare
  observed_role text;
begin
  select role into observed_role from public.profiles where id = '55555555-5555-5555-5555-555555555555';
  if observed_role is distinct from 'resident' then
    raise exception using errcode = 'TSTFL',
      message = format('admin_remove_official did not remove correctly: role=%s', observed_role);
  end if;
  raise notice 'ok: admin_remove_official removed the target correctly';
end $$;
```

- [ ] **Step 4: Run the RLS test file against the live project**

There is no local Supabase instance configured for this repo (checked: no `supabase start`/Docker workflow evidenced anywhere in this session; every prior schema change this session went straight through the Supabase MCP tools against the linked project). Run `supabase/tests/rls.sql` the same way: via the Supabase MCP `execute_sql` tool, pasting the file's full contents (it is a plain SQL script, `begin`/fixtures/assertions/no `commit` — read the file's own top and bottom to confirm whether it wraps itself in a transaction that must be rolled back after, and if so, either let it roll back naturally or issue `rollback` after reading the output, so this test run leaves no fixture rows behind in the real project).

Expected: every `raise notice 'ok: ...'` line appears in the output for both the pre-existing assertions and the six new ones above; no `SECURITY TEST FAILED` exception.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/rls.sql
git commit -m "feat: admin role, widened official gates, and admin-only appoint/remove-officials RPCs"
```

---

### Task 2: `official.ts` type and `loadOfficial()` admin recognition

**Files:**
- Modify: `src/lib/auth/official.ts`
- Modify: `src/lib/auth/load-official.ts`
- Test: `src/lib/auth/official.test.ts`, `src/lib/auth/load-official.test.ts`

**Interfaces:**
- Consumes: `profiles.role` can now be `'admin'` (Task 1).
- Produces: `Official.level` is `"barangay" | "municipality" | "admin"`. `loadOfficial()` returns `{ state: "official", official: { level: "admin", areaCode: "", areaName: "All areas", ... } }` for an admin. Task 4's `/admin/officials` page and its access check both read `gate.official.level === "admin"` — exact string, exact field.

- [ ] **Step 1: Write the failing test for `official.ts`'s widened type**

Add to `src/lib/auth/official.test.ts`, inside the existing `describe("landingPathFor", ...)` block:

```typescript
  it("sends an admin to the overview (null), same as a municipal official", () => {
    const official: Official = {
      userId: "u4",
      displayName: "Test Admin",
      areaCode: "",
      areaName: "All areas",
      level: "admin",
    };
    expect(landingPathFor(official, zones)).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/auth/official.test.ts`
Expected: FAIL — TypeScript error, `Type '"admin"' is not assignable to type '"barangay" | "municipality"'` (this surfaces as a Vitest/esbuild transform failure, since `level: "admin"` in the test's object literal does not satisfy the current `Official` type).

- [ ] **Step 3: Widen the type**

In `src/lib/auth/official.ts`, change:

```typescript
  level: "barangay" | "municipality";
```

to:

```typescript
  level: "barangay" | "municipality" | "admin";
```

No other change in this file — `landingPathFor`'s existing `if (official.level !== "barangay") return null;` already returns `null` for `"admin"` with no further edit, and `isInArea`/`areaLevel` are never called with an admin's area code by this file's own logic (Task 3 confirms this is also true everywhere `isInArea` is called from `official-context.tsx`).

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/auth/official.test.ts`
Expected: PASS, all tests including the new one.

- [ ] **Step 5: Write the failing test for `loadOfficial()`'s admin branch**

Add to `src/lib/auth/load-official.test.ts`, after the existing `"resolves a 7-digit operator's area against municipalities..."` test:

```typescript
  it("returns an admin with no area lookup at all — area_code is NULL for an admin", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "admin-1" } } });
    profileChain({ role: "admin", area_code: null, display_name: "Test Admin" });
    const { loadOfficial } = await import("./load-official");

    const gate = await loadOfficial();

    expect(gate).toEqual({
      state: "official",
      official: {
        userId: "admin-1",
        displayName: "Test Admin",
        areaCode: "",
        areaName: "All areas",
        level: "admin",
      },
    });
    expect(referenceFrom).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/auth/load-official.test.ts`
Expected: FAIL — the current code's `profile?.role !== "operator"` check sends `role: "admin"` down the `not-appointed` branch instead, so the actual gate is `{ state: "not-appointed", email: null }`, not the expected object.

- [ ] **Step 7: Implement**

In `src/lib/auth/load-official.ts`, replace:

```typescript
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, area_code, display_name")
    .eq("id", claims.sub)
    .maybeSingle();

  if (profile?.role !== "operator" || !profile.area_code || !profile.display_name) {
    const email = typeof claims.email === "string" && claims.email ? claims.email : null;
    return { state: "not-appointed", email };
  }

  const level = areaLevel(profile.area_code);
  const reference = createSupabaseServerClient();
  const { data: place } =
    level === "barangay"
      ? await reference.from("zones").select("name").eq("psgc_barangay_code", profile.area_code).maybeSingle()
      : await reference.from("municipalities").select("name").eq("code", profile.area_code).maybeSingle();

  return {
    state: "official",
    official: {
      userId: claims.sub,
      displayName: profile.display_name,
      areaCode: profile.area_code,
      areaName: place?.name ?? profile.area_code,
      level,
    },
  };
```

with:

```typescript
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, area_code, display_name")
    .eq("id", claims.sub)
    .maybeSingle();

  if (profile?.role === "admin") {
    if (!profile.display_name) {
      const email = typeof claims.email === "string" && claims.email ? claims.email : null;
      return { state: "not-appointed", email };
    }
    // No zone/municipality lookup: an admin's area_code is NULL by design
    // (Task 1's admin_has_name constraint), and a Postgrest .eq(col, null)
    // filter can only ever return zero rows — attempting it would be dead
    // code that always fell through to the raw-code fallback anyway.
    return {
      state: "official",
      official: {
        userId: claims.sub,
        displayName: profile.display_name,
        areaCode: "",
        areaName: "All areas",
        level: "admin",
      },
    };
  }

  if (profile?.role !== "operator" || !profile.area_code || !profile.display_name) {
    const email = typeof claims.email === "string" && claims.email ? claims.email : null;
    return { state: "not-appointed", email };
  }

  const level = areaLevel(profile.area_code);
  const reference = createSupabaseServerClient();
  const { data: place } =
    level === "barangay"
      ? await reference.from("zones").select("name").eq("psgc_barangay_code", profile.area_code).maybeSingle()
      : await reference.from("municipalities").select("name").eq("code", profile.area_code).maybeSingle();

  return {
    state: "official",
    official: {
      userId: claims.sub,
      displayName: profile.display_name,
      areaCode: profile.area_code,
      areaName: place?.name ?? profile.area_code,
      level,
    },
  };
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/lib/auth/load-official.test.ts`
Expected: PASS, all 8 tests (7 existing + 1 new).

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth/official.ts src/lib/auth/official.test.ts src/lib/auth/load-official.ts src/lib/auth/load-official.test.ts
git commit -m "feat: recognize the admin role in the official gate"
```

---

### Task 3: Server Actions — `appointOfficial` / `removeOfficial`

**Files:**
- Create: `src/app/actions/appoint-official.ts`
- Create: `src/app/actions/remove-official.ts`
- Test: `src/app/actions/appoint-official.test.ts`, `src/app/actions/remove-official.test.ts`

**Interfaces:**
- Consumes: `private.admin_appoint_official(p_email, p_area, p_display_name)` / `private.admin_remove_official(p_email)` RPCs (Task 1). `ActionResult` from `src/app/actions/action-result.ts` (`{ ok: true } | { ok: false; permanent: boolean; error: string }`).
- Produces: `appointOfficial(input: { email: string; area: string; displayName: string }): Promise<ActionResult>`, `removeOfficial(input: { email: string }): Promise<ActionResult>`. Task 4's `OfficialsPanel` calls these two by exact name and shape.

- [ ] **Step 1: Write the failing test for `appointOfficial`**

Create `src/app/actions/appoint-official.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("appointOfficial", () => {
  it("calls the admin_appoint_official RPC with the given fields", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "admin-1" } } });
    rpc.mockResolvedValue({ error: null });
    const { appointOfficial } = await import("./appoint-official");

    const result = await appointOfficial({
      email: "juan@example.com",
      area: "Barangay Nilombot, Mapandan",
      displayName: "Juan Dela Cruz, BDRRMO Nilombot",
    });

    expect(rpc).toHaveBeenCalledWith("admin_appoint_official", {
      p_email: "juan@example.com",
      p_area: "Barangay Nilombot, Mapandan",
      p_display_name: "Juan Dela Cruz, BDRRMO Nilombot",
    });
    expect(result).toEqual({ ok: true });
  });

  it("reports no session as a permanent failure when the caller is signed out", async () => {
    getClaims.mockResolvedValue({ data: null });
    const { appointOfficial } = await import("./appoint-official");

    const result = await appointOfficial({ email: "x@example.com", area: "Mapandan", displayName: "X" });

    expect(result).toEqual({ ok: false, permanent: true, error: "No session — sign in and try again." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces the database's own error message rather than a generic failure", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "admin-1" } } });
    rpc.mockResolvedValue({ error: { message: "No account for x@example.com. Ask them to sign in once first." } });
    const { appointOfficial } = await import("./appoint-official");

    const result = await appointOfficial({ email: "x@example.com", area: "Mapandan", displayName: "X" });

    expect(result).toEqual({
      ok: false,
      permanent: true,
      error: "No account for x@example.com. Ask them to sign in once first.",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/actions/appoint-official.test.ts`
Expected: FAIL with "Cannot find module './appoint-official'" (the file does not exist yet).

- [ ] **Step 3: Implement `appoint-official.ts`**

```typescript
"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

async function callerId(
  supabase: Awaited<ReturnType<typeof createSupabaseUserClient>>
): Promise<string | undefined> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub;
}

export interface AppointOfficialInput {
  email: string;
  /** A barangay ("Barangay X, Town"), a municipality name, or a raw PSGC code — same free-text format private.appoint_official already parses. */
  area: string;
  displayName: string;
}

/**
 * An admin appointing someone as an official. This is a thin wrapper —
 * every rule (area parsing, email-confirmed check, ambiguous-name refusal)
 * lives in private.admin_appoint_official / private.appoint_official
 * (see the migration in Task 1); the database is the one place that rejects
 * a non-admin caller, exactly like setZoneAlert's pattern for operators.
 * No queue: an admin appointing someone is a decision made at a desk with a
 * working connection, not an event that must survive a dropped signal.
 */
export async function appointOfficial(input: AppointOfficialInput): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const userId = await callerId(supabase);
  if (!userId) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { error } = await supabase.rpc("admin_appoint_official", {
    p_email: input.email,
    p_area: input.area,
    p_display_name: input.displayName,
  });

  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/app/actions/appoint-official.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Write the failing test for `removeOfficial`**

Create `src/app/actions/remove-official.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("removeOfficial", () => {
  it("calls the admin_remove_official RPC with the given email", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "admin-1" } } });
    rpc.mockResolvedValue({ error: null });
    const { removeOfficial } = await import("./remove-official");

    const result = await removeOfficial({ email: "juan@example.com" });

    expect(rpc).toHaveBeenCalledWith("admin_remove_official", { p_email: "juan@example.com" });
    expect(result).toEqual({ ok: true });
  });

  it("reports no session as a permanent failure when the caller is signed out", async () => {
    getClaims.mockResolvedValue({ data: null });
    const { removeOfficial } = await import("./remove-official");

    const result = await removeOfficial({ email: "x@example.com" });

    expect(result).toEqual({ ok: false, permanent: true, error: "No session — sign in and try again." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces the database's own error message", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "admin-1" } } });
    rpc.mockResolvedValue({ error: { message: "No official with email x@example.com." } });
    const { removeOfficial } = await import("./remove-official");

    const result = await removeOfficial({ email: "x@example.com" });

    expect(result).toEqual({ ok: false, permanent: true, error: "No official with email x@example.com." });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/app/actions/remove-official.test.ts`
Expected: FAIL with "Cannot find module './remove-official'".

- [ ] **Step 7: Implement `remove-official.ts`**

```typescript
"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

async function callerId(
  supabase: Awaited<ReturnType<typeof createSupabaseUserClient>>
): Promise<string | undefined> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub;
}

export interface RemoveOfficialInput {
  email: string;
}

/** An admin removing someone's official status. Same shape as appointOfficial — see its own doc comment. */
export async function removeOfficial(input: RemoveOfficialInput): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const userId = await callerId(supabase);
  if (!userId) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { error } = await supabase.rpc("admin_remove_official", { p_email: input.email });

  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/app/actions/remove-official.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 9: Commit**

```bash
git add src/app/actions/appoint-official.ts src/app/actions/appoint-official.test.ts src/app/actions/remove-official.ts src/app/actions/remove-official.test.ts
git commit -m "feat: appointOfficial/removeOfficial server actions for the admin role"
```

---

### Task 4: `/admin/officials` — admin-only UI to appoint and remove officials

**Files:**
- Create: `src/app/admin/officials/page.tsx`
- Create: `src/features/admin/officials-panel.tsx`
- Create: `src/lib/official-rows-mapper.ts`
- Modify: `src/features/admin/admin-header.tsx`
- Test: `src/features/admin/officials-panel.test.tsx`, `src/lib/official-rows-mapper.test.ts`, `src/features/admin/admin-header.test.tsx` (create if absent — check first)

**Interfaces:**
- Consumes: `appointOfficial`, `removeOfficial` (Task 3). `useOfficial()` from `src/lib/auth/official-context.tsx` (existing). Current officials list: `public.profiles` rows where `role = 'operator'`, queried server-side.
- Produces: nothing later tasks depend on — this is the last app-code task before the test-account script.

- [ ] **Step 1: Write the failing test for `OfficialsPanel`**

Create `src/features/admin/officials-panel.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OfficialsPanel } from "./officials-panel";
import { LanguageProvider } from "@/features/i18n/language-provider";

const appointOfficial = vi.fn();
const removeOfficial = vi.fn();

vi.mock("@/app/actions/appoint-official", () => ({
  appointOfficial: (...args: unknown[]) => appointOfficial(...args),
}));
vi.mock("@/app/actions/remove-official", () => ({
  removeOfficial: (...args: unknown[]) => removeOfficial(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const OFFICIALS = [
  { email: "juan@example.com", displayName: "Juan Dela Cruz, BDRRMO Nilombot", areaName: "Barangay Nilombot, Mapandan" },
];

function renderPanel(officials = OFFICIALS) {
  return render(
    <LanguageProvider>
      <OfficialsPanel officials={officials} />
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  appointOfficial.mockResolvedValue({ ok: true });
  removeOfficial.mockResolvedValue({ ok: true });
});

describe("OfficialsPanel", () => {
  it("lists every current official by name and area", () => {
    renderPanel();
    expect(screen.getByText("Juan Dela Cruz, BDRRMO Nilombot")).toBeInTheDocument();
    expect(screen.getByText("Barangay Nilombot, Mapandan")).toBeInTheDocument();
  });

  it("appoints a new official from the form and refreshes on success", async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "maria@example.com" } });
    fireEvent.change(screen.getByLabelText(/area/i), { target: { value: "Barangay Poblacion, Mangaldan" } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Maria Santos" } });
    fireEvent.click(screen.getByRole("button", { name: /appoint/i }));

    await waitFor(() =>
      expect(appointOfficial).toHaveBeenCalledWith({
        email: "maria@example.com",
        area: "Barangay Poblacion, Mangaldan",
        displayName: "Maria Santos",
      })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the database's own error text on a failed appointment, without refreshing", async () => {
    appointOfficial.mockResolvedValue({
      ok: false,
      permanent: true,
      error: "No account for maria@example.com. Ask them to sign in once first.",
    });
    renderPanel();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "maria@example.com" } });
    fireEvent.change(screen.getByLabelText(/area/i), { target: { value: "Mapandan" } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Maria" } });
    fireEvent.click(screen.getByRole("button", { name: /appoint/i }));

    expect(await screen.findByText("No account for maria@example.com. Ask them to sign in once first.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("removes an official and refreshes on success", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(removeOfficial).toHaveBeenCalledWith({ email: "juan@example.com" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/admin/officials-panel.test.tsx`
Expected: FAIL with "Cannot find module './officials-panel'".

- [ ] **Step 3: Implement `officials-panel.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { appointOfficial } from "@/app/actions/appoint-official";
import { removeOfficial } from "@/app/actions/remove-official";
import type { LocalizedText } from "@/lib/types";

const EMAIL_LABEL: LocalizedText = { en: "Email", fil: "Email" };
const AREA_LABEL: LocalizedText = {
  en: "Area (e.g. \"Barangay Nilombot, Mapandan\" or \"Mapandan\")",
  fil: "Lugar (hal. \"Barangay Nilombot, Mapandan\" o \"Mapandan\")",
};
const DISPLAY_NAME_LABEL: LocalizedText = { en: "Display name", fil: "Ipapakitang pangalan" };
const APPOINT: LocalizedText = { en: "Appoint", fil: "Italaga" };
const REMOVE: LocalizedText = { en: "Remove", fil: "Alisin" };
const CURRENT_OFFICIALS: LocalizedText = { en: "Current officials", fil: "Kasalukuyang mga opisyal" };
const NO_OFFICIALS: LocalizedText = { en: "No officials appointed yet.", fil: "Wala pang itinalagang opisyal." };

export interface OfficialRow {
  email: string;
  displayName: string;
  areaName: string;
}

export function OfficialsPanel({ officials }: { officials: OfficialRow[] }) {
  const { lang } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [area, setArea] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState<"appoint" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAppoint(event: React.FormEvent) {
    event.preventDefault();
    setPending("appoint");
    setError(null);
    const result = await appointOfficial({ email, area, displayName });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail("");
    setArea("");
    setDisplayName("");
    router.refresh();
  }

  async function handleRemove(targetEmail: string) {
    setPending(targetEmail);
    setError(null);
    const result = await removeOfficial({ email: targetEmail });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAppoint} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="official-email">{t(EMAIL_LABEL, lang)}</Label>
          <Input
            id="official-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending === "appoint"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="official-area">{t(AREA_LABEL, lang)}</Label>
          <Input
            id="official-area"
            type="text"
            required
            value={area}
            onChange={(event) => setArea(event.target.value)}
            disabled={pending === "appoint"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="official-display-name">{t(DISPLAY_NAME_LABEL, lang)}</Label>
          <Input
            id="official-display-name"
            type="text"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={pending === "appoint"}
          />
        </div>
        <Button type="submit" size="lg" disabled={pending === "appoint"}>
          {t(APPOINT, lang)}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>

      <div className="space-y-2">
        <h2 lang={lang} className="text-sm font-medium">
          {t(CURRENT_OFFICIALS, lang)}
        </h2>
        {officials.length === 0 && (
          <p lang={lang} className="text-sm text-muted-foreground">
            {t(NO_OFFICIALS, lang)}
          </p>
        )}
        <ul className="space-y-2">
          {officials.map((official) => (
            <li
              key={official.email}
              className="flex items-center justify-between gap-3 rounded-md border-2 border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{official.displayName}</p>
                <p className="truncate text-sm text-muted-foreground">{official.areaName}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pending === official.email}
                onClick={() => handleRemove(official.email)}
              >
                {t(REMOVE, lang)}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/features/admin/officials-panel.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Write the failing test for the pure row-mapping function**

`src/app/admin/history/page.tsx` has no test file of its own — its row-shaping logic lives in a separate, directly-tested pure module (`src/lib/official-actions-mapper.ts` / `official-actions-mapper.test.ts`), and the page itself is thin composition. This step follows that exact precedent for `/admin/officials`, rather than writing a heavily-mocked async-server-component test with no precedent in this codebase to match.

Create `src/lib/official-rows-mapper.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { toOfficialRows, type ProfileRow, type PlaceRow } from "./official-rows-mapper";

const ZONES: PlaceRow[] = [{ code: "0105528012", name: "Barangay Nilombot, Mapandan" }];
const MUNICIPALITIES: PlaceRow[] = [{ code: "0105528", name: "Mapandan" }];

describe("toOfficialRows", () => {
  it("resolves a 10-digit area_code against the zones list", () => {
    const profiles: ProfileRow[] = [{ id: "u1", display_name: "Juan", area_code: "0105528012" }];
    const emailById = new Map([["u1", "juan@example.com"]]);

    expect(toOfficialRows(profiles, ZONES, MUNICIPALITIES, emailById)).toEqual([
      { email: "juan@example.com", displayName: "Juan", areaName: "Barangay Nilombot, Mapandan" },
    ]);
  });

  it("resolves a 7-digit area_code against the municipalities list", () => {
    const profiles: ProfileRow[] = [{ id: "u2", display_name: "Pedro", area_code: "0105528" }];
    const emailById = new Map([["u2", "pedro@example.com"]]);

    expect(toOfficialRows(profiles, ZONES, MUNICIPALITIES, emailById)).toEqual([
      { email: "pedro@example.com", displayName: "Pedro", areaName: "Mapandan" },
    ]);
  });

  it("falls back to the raw area code when no matching zone or municipality is found", () => {
    const profiles: ProfileRow[] = [{ id: "u3", display_name: "Ana", area_code: "9999999999" }];
    const emailById = new Map([["u3", "ana@example.com"]]);

    expect(toOfficialRows(profiles, ZONES, MUNICIPALITIES, emailById)).toEqual([
      { email: "ana@example.com", displayName: "Ana", areaName: "9999999999" },
    ]);
  });

  it("falls back to '(unknown)' for an email the lookup map has no entry for", () => {
    const profiles: ProfileRow[] = [{ id: "u4", display_name: "Rosa", area_code: "0105528012" }];

    expect(toOfficialRows(profiles, ZONES, MUNICIPALITIES, new Map())).toEqual([
      { email: "(unknown)", displayName: "Rosa", areaName: "Barangay Nilombot, Mapandan" },
    ]);
  });

  it("falls back to an empty display name when display_name is null", () => {
    const profiles: ProfileRow[] = [{ id: "u5", display_name: null, area_code: "0105528012" }];
    const emailById = new Map([["u5", "x@example.com"]]);

    expect(toOfficialRows(profiles, ZONES, MUNICIPALITIES, emailById)).toEqual([
      { email: "x@example.com", displayName: "", areaName: "Barangay Nilombot, Mapandan" },
    ]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/official-rows-mapper.test.ts`
Expected: FAIL with "Cannot find module './official-rows-mapper'".

- [ ] **Step 7: Implement `official-rows-mapper.ts` and `page.tsx`**

Create `src/lib/official-rows-mapper.ts`:

```typescript
import type { OfficialRow } from "@/features/admin/officials-panel";

export interface ProfileRow {
  id: string;
  display_name: string | null;
  area_code: string | null;
}

export interface PlaceRow {
  code: string;
  name: string;
}

/** Same 10-digit-barangay / else-municipality split as areaLevel() in src/lib/auth/official.ts — kept separate here because this maps DB rows to display rows, not an area code to a level. */
export function toOfficialRows(
  profiles: ProfileRow[],
  zones: PlaceRow[],
  municipalities: PlaceRow[],
  emailById: Map<string, string>
): OfficialRow[] {
  const zoneNameByCode = new Map(zones.map((z) => [z.code, z.name]));
  const municipalityNameByCode = new Map(municipalities.map((m) => [m.code, m.name]));

  return profiles.map((profile) => ({
    email: emailById.get(profile.id) ?? "(unknown)",
    displayName: profile.display_name ?? "",
    areaName:
      (profile.area_code?.length === 10
        ? zoneNameByCode.get(profile.area_code)
        : municipalityNameByCode.get(profile.area_code ?? "")) ??
      profile.area_code ??
      "",
  }));
}
```

Create `src/app/admin/officials/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { loadOfficial } from "@/lib/auth/load-official";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toOfficialRows } from "@/lib/official-rows-mapper";
import { OfficialsPanel } from "@/features/admin/officials-panel";

/**
 * Admin-only. The /admin layout has already gated this request to a
 * signed-in, appointed official (admin or otherwise) — this page adds the
 * one further check that matters here: level === "admin". An official
 * visiting this URL directly gets a 404, not a redirect that would hint at
 * this page's existence, matching this plan's Review Focus: hiding the nav
 * link is not the gate, this is. The row-shaping logic itself lives in
 * official-rows-mapper.ts (see its own test) — this page is composition
 * only, same split as /admin/history and official-actions-mapper.ts.
 */
export default async function OfficialsPage() {
  const gate = await loadOfficial();
  if (gate.state !== "official" || gate.official.level !== "admin") {
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const [{ data: profiles }, { data: zones }, { data: municipalities }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, area_code").eq("role", "operator"),
    supabase.from("zones").select("psgc_barangay_code, name"),
    supabase.from("municipalities").select("code, name"),
  ]);

  // Emails live in auth.users, not profiles, and reading auth.users needs
  // the service-role key (createSupabaseServerClient uses the publishable
  // key, RLS-enforced — same construction as every other admin-only
  // service-role read in this codebase, e.g. src/app/api/threshold-check/
  // route.ts). Fetched per-official by id (getUserById), not listUsers():
  // this project's auth.users also holds every anonymous resident session,
  // and there is no reason this page's read should be sized to that when
  // the officials list itself is a handful of rows.
  const adminAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ).auth.admin;
  const emailById = new Map(
    await Promise.all(
      (profiles ?? []).map(async (profile) => {
        const { data } = await adminAuth.getUserById(profile.id);
        return [profile.id, data.user?.email ?? "(unknown)"] as const;
      })
    )
  );

  const rows = toOfficialRows(
    profiles ?? [],
    (zones ?? []).map((z) => ({ code: z.psgc_barangay_code, name: z.name })),
    municipalities ?? [],
    emailById
  );

  return <OfficialsPanel officials={rows} />;
}
```

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { loadOfficial } from "@/lib/auth/load-official";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OfficialsPanel, type OfficialRow } from "@/features/admin/officials-panel";

/**
 * Admin-only. The /admin layout has already gated this request to a
 * signed-in, appointed official (admin or otherwise) — this page adds the
 * one further check that matters here: level === "admin". An official
 * visiting this URL directly gets a 404, not a redirect that would hint at
 * this page's existence, matching this plan's Review Focus: hiding the nav
 * link is not the gate, this is.
 */
export default async function OfficialsPage() {
  const gate = await loadOfficial();
  if (gate.state !== "official" || gate.official.level !== "admin") {
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const [{ data: officials }, { data: zoneRows }, { data: municipalityRows }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, area_code").eq("role", "operator"),
    supabase.from("zones").select("psgc_barangay_code, name"),
    supabase.from("municipalities").select("code, name"),
  ]);

  // Emails live in auth.users, not profiles, and reading auth.users needs
  // the service-role key (createSupabaseServerClient uses the publishable
  // key, RLS-enforced — same construction as every other admin-only
  // service-role read in this codebase, e.g. src/app/api/threshold-check/
  // route.ts). Fetched per-official by id (getUserById), not listUsers():
  // this project's auth.users also holds every anonymous resident session,
  // and there is no reason this page's read should be sized to that when
  // the officials list itself is a handful of rows.
  const adminAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ).auth.admin;
  const emailById = new Map(
    await Promise.all(
      (officials ?? []).map(async (official) => {
        const { data } = await adminAuth.getUserById(official.id);
        return [official.id, data.user?.email ?? "(unknown)"] as const;
      })
    )
  );
  const zoneNameByCode = new Map((zoneRows ?? []).map((z) => [z.psgc_barangay_code, z.name]));
  const municipalityNameByCode = new Map((municipalityRows ?? []).map((m) => [m.code, m.name]));

  const rows: OfficialRow[] = (officials ?? []).map((official) => ({
    email: emailById.get(official.id) ?? "(unknown)",
    displayName: official.display_name ?? "",
    areaName:
      (official.area_code?.length === 10 ? zoneNameByCode.get(official.area_code) : municipalityNameByCode.get(official.area_code ?? "")) ??
      official.area_code ??
      "",
  }));

  return <OfficialsPanel officials={rows} />;
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/lib/official-rows-mapper.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 9: Add the nav link — write the failing test first**

Check whether `src/features/admin/admin-header.test.tsx` exists. If not, create it; if it does, add to it:

```typescript
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { AdminHeader } from "./admin-header";
import { renderWithData } from "@/test-utils/render-with-data";
import { OfficialContext } from "@/lib/auth/official-context";
import { LanguageProvider } from "@/features/i18n/language-provider";
import type { Official } from "@/lib/auth/official";

function renderHeader(official: Official) {
  return renderWithData(
    <LanguageProvider>
      <OfficialContext.Provider value={official}>
        <AdminHeader />
      </OfficialContext.Provider>
    </LanguageProvider>
  );
}

describe("AdminHeader", () => {
  it("shows an Officials link only for an admin", () => {
    renderHeader({ userId: "u1", displayName: "Test Admin", areaCode: "", areaName: "All areas", level: "admin" });
    expect(screen.getByRole("link", { name: /officials/i })).toBeInTheDocument();
  });

  it("hides the Officials link for a barangay or municipal official", () => {
    renderHeader({ userId: "u2", displayName: "Test Official", areaCode: "0105528012", areaName: "Barangay Nilombot", level: "barangay" });
    expect(screen.queryByRole("link", { name: /officials/i })).not.toBeInTheDocument();
  });
});
```

(If `admin-header.test.tsx` already exists with different setup, e.g. a different render helper, follow the file's own existing pattern instead of this one — read it first.)

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run src/features/admin/admin-header.test.tsx`
Expected: FAIL — no "Officials" link exists yet.

- [ ] **Step 11: Implement**

In `src/features/admin/admin-header.tsx`, add a new `LocalizedText`:

```typescript
const OFFICIALS: LocalizedText = { en: "Officials", fil: "Mga Opisyal" };
```

and inside the `<div className="flex items-center gap-2">`, before the existing History link:

```tsx
        {official.level === "admin" && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/officials">{t(OFFICIALS, lang)}</Link>
          </Button>
        )}
```

- [ ] **Step 12: Run it to verify it passes**

Run: `npx vitest run src/features/admin/admin-header.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 13: Run the whole affected area and commit**

Run: `npx vitest run src/features/admin src/app/admin/officials src/lib/official-rows-mapper.test.ts`
Expected: all pass.

```bash
git add src/app/admin/officials src/features/admin/officials-panel.tsx src/features/admin/officials-panel.test.tsx src/lib/official-rows-mapper.ts src/lib/official-rows-mapper.test.ts src/features/admin/admin-header.tsx src/features/admin/admin-header.test.tsx
git commit -m "feat: admin-only /admin/officials page to appoint and remove officials"
```

---

### Task 5: Restore `signInWithPassword` / `signUpWithPassword`

**Files:**
- Modify: `src/lib/auth/sign-in.ts`
- Modify: `src/lib/auth/sign-in.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `signInWithPassword(email: string, password: string): Promise<SignInResult>`, `signUpWithPassword(email: string, password: string): Promise<SignInResult>` — exact names and signatures Task 6's UI calls.

- [ ] **Step 1: Read the exact code being restored**

Run: `git show f06fc75^:src/lib/auth/sign-in.ts` and `git show f06fc75^:src/lib/auth/sign-in.test.ts` — this plan's Task 5 restores the `signInWithPassword`/`signUpWithPassword` functions and their tests from that output verbatim (shown in full in this plan's context above; re-read the git output directly rather than retyping from memory, in case anything here has a transcription error). Do **not** restore `sendEmailSignInLink` or its tests — magic-link stays removed.

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/auth/sign-in.test.ts` (the current file, which still tests `startGoogleSignIn` — add alongside it, do not replace):

```typescript
const signInWithPassword = vi.fn();
const signUp = vi.fn();
```

Add these two to the existing `vi.mock("@/lib/supabase/browser", ...)` factory's returned `auth` object, alongside the existing `getSession`, `linkIdentity`, `signInWithOAuth`.

Add to the existing `beforeEach`:

```typescript
  signInWithPassword.mockResolvedValue({ error: null });
  signUp.mockResolvedValue({ error: null });
```

Then add two new `describe` blocks, copied from `git show f06fc75^:src/lib/auth/sign-in.test.ts`'s `describe("signInWithPassword", ...)` and `describe("signUpWithPassword", ...)` blocks in full (6 tests total — 2 for sign-in, 4 for sign-up, all shown in this plan's context above).

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/auth/sign-in.test.ts`
Expected: FAIL — `signInWithPassword`/`signUpWithPassword` are not exported from `./sign-in` yet.

- [ ] **Step 4: Implement**

Append to `src/lib/auth/sign-in.ts` (after the existing `startGoogleSignIn`), copied from `git show f06fc75^:src/lib/auth/sign-in.ts`'s `signInWithPassword` and `signUpWithPassword` functions in full, including their doc comments and the `EMAIL_TAKEN_CODES` constant they both need (shown in this plan's context above) — **not** `sendEmailSignInLink`.

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/lib/auth/sign-in.test.ts`
Expected: PASS, all tests (existing `startGoogleSignIn` tests + the 6 restored ones).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/sign-in.ts src/lib/auth/sign-in.test.ts
git commit -m "feat: restore password sign-in and sign-up (not magic-link)"
```

---

### Task 6: Restore the password form in `SignInPanel`

**Files:**
- Modify: `src/features/auth/sign-in-panel.tsx`
- Modify: `src/features/auth/sign-in-panel.test.tsx`

**Interfaces:**
- Consumes: `signInWithPassword`, `signUpWithPassword` (Task 5).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Update the two tests whose premise this task reverses**

In `src/features/auth/sign-in-panel.test.tsx`, the test `"offers no password account creation to residents"` asserted a decision this task deliberately reverses (residents can now optionally create a password account). Replace it with:

```typescript
  it("offers password sign-in and sign-up to residents", () => {
    render(
      <LanguageProvider>
        <SignInPanel next="/" />
      </LanguageProvider>
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });
```

The test `"offers no email sign-in link, which cannot work without project SMTP"` stays exactly as-is — magic-link is still not restored, and this assertion remains true.

- [ ] **Step 2: Write the new failing tests for the password form itself**

Add to `src/features/auth/sign-in-panel.test.tsx`:

```typescript
  describe("password sign-in", () => {
    const signInWithPassword = vi.fn();
    const signUpWithPassword = vi.fn();

    beforeEach(() => {
      signInWithPassword.mockResolvedValue({ ok: true });
      signUpWithPassword.mockResolvedValue({ ok: true });
    });

    it("signs in with the typed email and password", async () => {
      render(
        <LanguageProvider>
          <SignInPanel next="/admin" />
        </LanguageProvider>
      );

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "official@weatherwell.com" } });
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "<redacted>" } });
      fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() =>
        expect(signInWithPassword).toHaveBeenCalledWith("official@weatherwell.com", "<redacted>")
      );
    });

    it("switches to sign-up mode and calls signUpWithPassword instead", async () => {
      render(
        <LanguageProvider>
          <SignInPanel next="/" />
        </LanguageProvider>
      );

      fireEvent.click(screen.getByRole("button", { name: /create account/i }));
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@example.com" } });
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "hunter2222" } });
      fireEvent.click(screen.getByRole("button", { name: /create account/i }));

      await waitFor(() => expect(signUpWithPassword).toHaveBeenCalledWith("new@example.com", "hunter2222"));
    });

    it("shows the account-created notice after a successful sign-up", async () => {
      render(
        <LanguageProvider>
          <SignInPanel next="/" />
        </LanguageProvider>
      );

      fireEvent.click(screen.getByRole("button", { name: /create account/i }));
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@example.com" } });
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "hunter2222" } });
      fireEvent.click(screen.getByRole("button", { name: /create account/i }));

      expect(await screen.findByText(/check your email to confirm/i)).toBeInTheDocument();
    });

    it("shows a password sign-in error next to the form", async () => {
      signInWithPassword.mockResolvedValue({ ok: false, error: "Invalid login credentials" });
      render(
        <LanguageProvider>
          <SignInPanel next="/" />
        </LanguageProvider>
      );

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "x@example.com" } });
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "wrong" } });
      fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

      expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
    });
  });
```

Add the corresponding mock to the top of the file, alongside the existing `startGoogleSignIn` mock:

```typescript
vi.mock("@/lib/auth/sign-in", () => ({
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignIn(...args),
  signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
  signUpWithPassword: (...args: unknown[]) => signUpWithPassword(...args),
}));
```

(`signInWithPassword`/`signUpWithPassword` need to be declared as `vi.fn()` alongside `startGoogleSignIn` at the top of the file, same as it already does for `startGoogleSignIn`.)

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/features/auth/sign-in-panel.test.tsx`
Expected: FAIL — no password field exists in the current panel; every test in the new `describe("password sign-in", ...)` block fails, plus the updated `"offers password sign-in and sign-up to residents"` test.

- [ ] **Step 4: Implement — restore the password form into the current panel**

Read `git show f06fc75^:src/features/auth/sign-in-panel.tsx` (shown in full in this plan's context above) for the password form's exact JSX shape (email/password inputs, the sign-in/sign-up toggle button, the `ACCOUNT_CREATED` notice). Merge it into the **current** `src/features/auth/sign-in-panel.tsx` — the current file already differs from that old version (no `mode`/magic-link state, current `CONTINUE_WITHOUT_ACCOUNT` label, current Google-only error handling) — so this is a merge, not a file replacement:

- Add `email`, `password`, `isSignUp`, `accountCreated` state (drop `mode`/`emailSent`, which were magic-link-only).
- Add `"password"` to the `Control` union type.
- Add the password `<form>` block from the old file, unconditionally rendered now (no `mode === "password"` branch, since magic-link's toggle button is gone) — right after the existing Google button block, before the `{!isOfficial && (...)}` guest-continue button.
- In `handleResult`, add the `if (control === "password") { if (isSignUp) setAccountCreated(true); else { router.push(next); router.refresh(); } }` branch from the old file — this needs `useRouter` from `next/navigation`, imported at the top (the current file does not import it; the old one does).
- Import `signInWithPassword`, `signUpWithPassword` from `@/lib/auth/sign-in` alongside the existing `startGoogleSignIn` import.
- Do **not** restore the magic-link `<form>` block or the `mode`-toggle button beneath it.

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/features/auth/sign-in-panel.test.tsx`
Expected: PASS, every test in the file (existing Google/guest tests unchanged, the updated test, and the 4 new password tests).

- [ ] **Step 6: Full-file gate and commit**

Run: `npx vitest run src/features/auth`
Expected: PASS.

```bash
git add src/features/auth/sign-in-panel.tsx src/features/auth/sign-in-panel.test.tsx
git commit -m "feat: restore the password sign-in/sign-up form in SignInPanel"
```

---

### Task 7: Create the three test accounts, and the manual Supabase Dashboard step

**Files:**
- Create: `scripts/create-test-accounts.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — confirmed exact env var names, matching `src/app/api/threshold-check/route.ts`'s `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)`, this codebase's own established inline service-role-client pattern (there is no shared helper to import — every call site, including this one, constructs it inline). `@supabase/supabase-js`'s `createClient(...).auth.admin.createUser(...)`.
- Produces: three real rows in the live project's `auth.users` and `public.profiles`. Nothing in the app's own code depends on this script; it is run once, by hand.

- [ ] **Step 1: Write `scripts/create-test-accounts.ts`**

```typescript
/**
 * Creates the three fixed test accounts for the admin/official/user role
 * tiers, in the LIVE project this script's env vars point at. Run once,
 * by hand: `npx tsx scripts/create-test-accounts.ts`. Not part of any
 * build step or CI job — re-running it is safe (each createUser call for
 * an email that already exists fails loudly, logged and skipped, rather
 * than silently overwriting anything) but pointless once it has succeeded.
 *
 * Uses the Admin API (auth.admin.createUser with email_confirm: true)
 * rather than inserting into auth.users directly — a raw SQL insert would
 * need to reproduce GoTrue's exact password-hash format and its
 * auth.identities row by hand, which Supabase's own guidance says not to
 * do (see the design spec this script implements, Task 7's "how the 3
 * test accounts are created" decision).
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Account {
  email: string;
  password: string;
  role: "admin" | "operator" | "resident";
  displayName?: string;
  area?: string;
}

const ACCOUNTS: Account[] = [
  { email: "admin@weatherwell.com", password: "<redacted>", role: "admin", displayName: "Test Admin" },
  {
    email: "official@weatherwell.com",
    password: "<redacted>",
    role: "operator",
    displayName: "Test Official",
    area: "Barangay Nilombot, Mapandan",
  },
  { email: "user@weatherwell.com", password: "<redacted>", role: "resident" },
];

async function main() {
  for (const account of ACCOUNTS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    });
    if (error) {
      console.error(`Failed to create ${account.email}: ${error.message}`);
      continue;
    }
    const userId = data.user.id;
    console.log(`Created ${account.email} (${userId})`);

    if (account.role === "resident") continue;

    if (account.role === "admin") {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role: "admin", display_name: account.displayName })
        .eq("id", userId);
      if (profileError) console.error(`Failed to set admin role for ${account.email}: ${profileError.message}`);
      else console.log(`  -> role=admin, display_name=${account.displayName}`);
      continue;
    }

    // operator: go through admin_appoint_official's underlying logic by
    // calling the same appoint_official function the SQL editor would —
    // this service-role client can, since it runs as postgres for RPC
    // calls the same way every other privileged script-side write in this
    // codebase does. Using appoint_official (not a raw profiles update)
    // means this script gets the exact same area-name parsing and
    // coverage report a real appointment would.
    const { data: result, error: appointError } = await supabase.rpc("appoint_official", {
      p_email: account.email,
      p_area: account.area!,
      p_display_name: account.displayName!,
    });
    if (appointError) console.error(`Failed to appoint ${account.email}: ${appointError.message}`);
    else console.log(`  -> ${result}`);
  }
}

main();
```

- [ ] **Step 2: Run it, expecting the operator-appointment RPC call to be refused, and use the given fallback**

The `private.appoint_official` function's `execute` grant is revoked from `service_role` too (Task 1's migration deliberately left that revoke untouched) — so this script's own `supabase.rpc("appoint_official", ...)` call for the `official@weatherwell.com` row is *expected* to fail with a permission error. This is correct behavior, not a bug: the SQL editor runs as the database owner, which that revoke does not affect, so the fallback is a direct call there instead.

Run: `npx tsx scripts/create-test-accounts.ts`

Expected output: three "Created ..." lines — `admin@weatherwell.com` followed by "role=admin, display_name=Test Admin"; `official@weatherwell.com` followed by "Failed to appoint official@weatherwell.com: permission denied for function appoint_official" (or similar — this is the expected refusal, not a failure to fix); `user@weatherwell.com` with no further line (a resident needs nothing else).

Then, via the Supabase MCP `execute_sql` tool, run the fallback for the operator account:

```sql
select private.appoint_official('official@weatherwell.com', 'Barangay Nilombot, Mapandan', 'Test Official');
```

Expected: a returned string like `"Test Official is now an official for Nilombot, Mapandan — covers 1 barangay(s): Barangay Nilombot, Mapandan"`.

- [ ] **Step 3: Verify all three accounts, via the Supabase MCP `execute_sql` tool**

```sql
select u.email, p.role, p.area_code, p.display_name
from auth.users u join public.profiles p on p.id = u.id
where u.email in ('admin@weatherwell.com', 'official@weatherwell.com', 'user@weatherwell.com')
order by u.email;
```

Expected: three rows —
- `admin@weatherwell.com` — `role = admin`, `area_code = null`, `display_name = Test Admin`
- `official@weatherwell.com` — `role = operator`, `area_code` = Barangay Nilombot, Mapandan's real PSGC code (10 digits), `display_name = Test Official`
- `user@weatherwell.com` — `role = resident`, `area_code = null`, `display_name = null`

- [ ] **Step 4: Commit the script**

```bash
git add scripts/create-test-accounts.ts
git commit -m "chore: add one-off script that created the admin/official/user test accounts"
```

- [ ] **Step 5: Tell the user about the manual Dashboard step**

This step cannot be automated by any tool available in this session — say so plainly rather than silently skipping it. Tell the user: to make self-serve password sign-up actually usable for anyone other than these three pre-confirmed accounts, they need to go to the Supabase Dashboard → Authentication → Sign In / Providers → Email, and turn off "Confirm email". Remind them this also means `appoint_official`'s email-ownership check becomes a no-op for future appointments (the accepted tradeoff recorded in the spec) — so any *real* future appointment should still be verified out-of-band, the same way the original 09-11 design already assumed.

---

### Task 8: Full-project gate and live verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: every test passes, including every test this plan added or modified.

- [ ] **Step 2: Typecheck, lint, knip**

Run: `npm run typecheck && npm run lint && npm run knip`
Expected: typecheck clean; lint clean (the two pre-existing warnings in `src/app/api/historical-events/route.test.ts` are unrelated to this plan and may still appear); knip clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds; `/admin/officials` appears in the route list as a dynamic (`ƒ`) route, alongside the other `/admin/*` pages.

- [ ] **Step 4: Live verification in the browser, against the real accounts**

Start the dev server (`preview_start` with `weatherwell-dev`), then:
- Sign in with `official@weatherwell.com` / `<redacted>` via the password form. Confirm `/admin` shows the official's own area (Barangay Nilombot, Mapandan) and that `/admin/officials` is not linked in the header and returns a 404 if visited directly.
- Sign out, sign in with `admin@weatherwell.com` / `<redacted>`. Confirm `/admin` shows "All areas" (or however the header renders it), that "Officials" appears in the header nav, and that `/admin/officials` lists `official@weatherwell.com`'s appointment. Appoint a throwaway test official (any email that has signed in before — or note if none is available to test with) and confirm the list updates; remove them and confirm they disappear from the list, and that the RLS-enforced area restrictions still hold for the appointed accounts other than admin (e.g. the admin, not the barangay official, can set an alert for a *different* barangay).
- Sign in with `user@weatherwell.com` / `<redacted>`. Confirm this account behaves exactly like any other resident — sees the normal homepage, has no `/admin` access.
- Confirm Google sign-in still works unchanged for whatever account was used earlier this session.

Report exactly what was and was not verifiable (e.g. if no second real email is available to test a fresh appointment against, say so — don't claim it was tested).

- [ ] **Step 5: Final review and finish**

Per `superpowers:executing-plans`/`superpowers:subagent-driven-development`'s own final-review step (whichever execution method is chosen), dispatch or perform the whole-branch review, then `superpowers:finishing-a-development-branch`.
