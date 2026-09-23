# Stop the Bleeding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every security and alert-integrity hole found in the 2026-09-23 review before anything on `v1` is pushed to the public repo.

**Architecture:** Enforcement lives in the database. Every task that changes access or alert logic adds a self-contained block to `supabase/tests/rls.sql`, proves it fails against the live database first, then applies one migration and proves it passes. App changes are small and TDD'd with Vitest. The last task rotates the test-account passwords and scrubs the old ones from the 13 unpushed commits.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres 17, RLS, Auth), Vitest + Testing Library, Supabase MCP tools (`apply_migration`, `execute_sql`, `list_migrations`, `generate_typescript_types`, `get_advisors`).

**Spec:** `docs/superpowers/specs/2026-09-23-stop-the-bleeding-design.md` — read the "Corrections found while planning" section; it supersedes parts of sections 2–6.

## Global Constraints

- Zero cost, no new accounts. Only the owner's existing Supabase, Vercel and GitHub.
- The database is the live production Supabase project. There is no staging. Every migration is real.
- **Nothing is pushed** until Task 10 is complete and the owner approves the push.
- Test writes happen only inside `begin; … rollback;` transactions (Supabase MCP `execute_sql`), never committed.
- **Migration files must match live history.** For each migration: write `supabase/migrations/PENDING_<name>.sql`, apply the same SQL with MCP `apply_migration` using `<name>`, run MCP `list_migrations`, then `git mv` the file to `supabase/migrations/<live version>_<name>.sql`. This stops the file-name drift found in the review (M2).
- Never guess a Postgres constraint name; read it from `pg_constraint` first.
- The three old test passwords must never be written into any new file, commit message or chat message. Task 1 saves them to `.superpowers/sdd/2026-09-23-stop-the-bleeding/old-passwords.txt` (git-ignored); every later step reads that file.
- Every new user-facing string is a `LocalizedText` (`{ en, fil }`) passed through `t(...)`.
- `supabase/tests/rls.sql` runs as one transaction ending in `rollback;`. New blocks go immediately before that final `rollback;`, in task order.
- `tests.as_user()` / `tests.as_anon()` only record the impersonation for the next `tests.expect_allowed` / `tests.expect_denied`. They do **not** switch the role for a plain `do $$ … $$` block. A plain block that must run as a user does its own `set local role authenticated` plus `set_config('request.jwt.claims', …, true)`, and `reset role` before it raises.
- An isolated run of a task's `rls.sql` block is: `begin;` + the **SP1 fixtures** block (Task 2, Step 1) + that task's block + `rollback;`, sent as one MCP `execute_sql` call.

## Review Focus

- **An offline report made before an official's decision but delivered after it** must not count toward an automatic alert. `reported_at` is the made-at time, and only reports strictly after the decision count. Test: Task 2, E9.
- **The scheduled jobs (service role)** must still be able to run the engine and the weather cleanup after anonymous and signed-in access is revoked. Test: Task 3, SP1-P5.
- **Subscribing to push with no session (offline)** must not leave the UI showing "subscribed" when nothing was saved. Test: Task 5, "does not report subscribed when there is no session".
- **A resident filing a report after the column revoke.** The insert must still succeed, because supabase-js inserts without `RETURNING`. Test: Task 4, SP1-R5.
- **An active alert from another automatic source** (cascade, predicted) must not be replaced by a crowd-report alert. Test: Task 2, E8.

---

### Task 1: Credential script and document redaction

**Files:**
- Create: `scripts/rotate-test-account-passwords.ts`
- Test: `scripts/rotate-test-account-passwords.test.ts`
- Delete: `scripts/create-test-accounts.ts`
- Modify (redaction only): `docs/superpowers/specs/2026-09-22-admin-role-and-password-auth-design.md`, `docs/superpowers/plans/2026-09-22-admin-role-and-password-auth.md`, `src/features/auth/sign-in-panel.test.tsx`
- Create (git-ignored, never committed): `.superpowers/sdd/2026-09-23-stop-the-bleeding/old-passwords.txt`

**Interfaces:**
- Produces: `readTestPasswords(env: Record<string, string | undefined>): ReadResult`, `MIN_PASSWORD_LENGTH = 12`. Task 10 runs the script.
- Produces: `old-passwords.txt`, one old password per line. Task 10's history rewrite reads it.

- [ ] **Step 1: Save the old passwords outside git, before the only file that holds them is deleted**

```bash
mkdir -p .superpowers/sdd/2026-09-23-stop-the-bleeding
git show HEAD:scripts/create-test-accounts.ts \
  | grep -o 'password: "[^"]*"' \
  | sed -e 's/^password: "//' -e 's/"$//' \
  > .superpowers/sdd/2026-09-23-stop-the-bleeding/old-passwords.txt
wc -l .superpowers/sdd/2026-09-23-stop-the-bleeding/old-passwords.txt
git status --short --ignored .superpowers
```

Expected: `3 …old-passwords.txt`, and `git status` shows `!! .superpowers/` (ignored). Do not print the file's contents.

- [ ] **Step 2: Write the failing test**

Create `scripts/rotate-test-account-passwords.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readTestPasswords, MIN_PASSWORD_LENGTH } from "./rotate-test-account-passwords";

const GOOD = "a".repeat(MIN_PASSWORD_LENGTH);

describe("readTestPasswords", () => {
  it("returns one entry per test account when all three are set and long enough", () => {
    const result = readTestPasswords({
      TEST_ADMIN_PASSWORD: `${GOOD}1`,
      TEST_OFFICIAL_PASSWORD: `${GOOD}2`,
      TEST_USER_PASSWORD: `${GOOD}3`,
    });

    expect(result).toEqual({
      ok: true,
      passwords: [
        { email: "admin@weatherwell.com", password: `${GOOD}1` },
        { email: "official@weatherwell.com", password: `${GOOD}2` },
        { email: "user@weatherwell.com", password: `${GOOD}3` },
      ],
    });
  });

  it("names every missing variable instead of stopping at the first", () => {
    const result = readTestPasswords({ TEST_OFFICIAL_PASSWORD: GOOD });

    expect(result).toEqual({
      ok: false,
      error: "TEST_ADMIN_PASSWORD is not set; TEST_USER_PASSWORD is not set",
    });
  });

  it("refuses a password below the minimum length without echoing it", () => {
    const result = readTestPasswords({
      TEST_ADMIN_PASSWORD: "tiny1",
      TEST_OFFICIAL_PASSWORD: GOOD,
      TEST_USER_PASSWORD: GOOD,
    });

    expect(result).toEqual({ ok: false, error: "TEST_ADMIN_PASSWORD is shorter than 12 characters" });
    expect(JSON.stringify(result)).not.toContain("tiny1");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run scripts/rotate-test-account-passwords.test.ts`
Expected: FAIL with `Failed to resolve import "./rotate-test-account-passwords"`.

- [ ] **Step 4: Implement the script**

Create `scripts/rotate-test-account-passwords.ts`:

```typescript
/**
 * Sets new passwords on the three fixed test accounts. The passwords come
 * from the environment, never from this file. Run once, by hand:
 *
 *   set -a && source .env.local && set +a && npx tsx scripts/rotate-test-account-passwords.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const MIN_PASSWORD_LENGTH = 12;

const TEST_ACCOUNTS = [
  { email: "admin@weatherwell.com", envVar: "TEST_ADMIN_PASSWORD" },
  { email: "official@weatherwell.com", envVar: "TEST_OFFICIAL_PASSWORD" },
  { email: "user@weatherwell.com", envVar: "TEST_USER_PASSWORD" },
] as const;

export type ReadResult =
  | { ok: true; passwords: { email: string; password: string }[] }
  | { ok: false; error: string };

export function readTestPasswords(env: Record<string, string | undefined>): ReadResult {
  const problems: string[] = [];
  const passwords: { email: string; password: string }[] = [];

  for (const { email, envVar } of TEST_ACCOUNTS) {
    const value = env[envVar];
    if (!value) {
      problems.push(`${envVar} is not set`);
    } else if (value.length < MIN_PASSWORD_LENGTH) {
      problems.push(`${envVar} is shorter than ${MIN_PASSWORD_LENGTH} characters`);
    } else {
      passwords.push({ email, password: value });
    }
  }

  return problems.length > 0 ? { ok: false, error: problems.join("; ") } : { ok: true, passwords };
}

type AdminApi = SupabaseClient["auth"]["admin"];

async function findUserId(admin: AdminApi, email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
}

async function main() {
  const read = readTestPasswords(process.env);
  if (!read.ok) {
    console.error(read.error);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;

  let failed = false;
  for (const { email, password } of read.passwords) {
    const id = await findUserId(admin, email);
    if (!id) {
      console.error(`No account for ${email}`);
      failed = true;
      continue;
    }
    const { error } = await admin.updateUserById(id, { password });
    if (error) {
      console.error(`Failed to update ${email}: ${error.message}`);
      failed = true;
    } else {
      console.log(`Updated ${email}`);
    }
  }

  if (failed) process.exit(1);
}

// Only run when executed directly, so importing this in a test is side-effect free.
if (process.argv[1]?.endsWith("rotate-test-account-passwords.ts")) {
  void main();
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run scripts/rotate-test-account-passwords.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Delete the old script and redact every tracked copy of the old passwords**

```bash
git rm -q scripts/create-test-accounts.ts
PWFILE=.superpowers/sdd/2026-09-23-stop-the-bleeding/old-passwords.txt
while IFS= read -r pw; do
  escaped=$(printf '%s' "$pw" | sed 's/[][\.*^$/&]/\\&/g')
  git grep -lF -- "$pw" | while IFS= read -r file; do
    sed -i "s/${escaped}/<redacted>/g" "$file"
  done
done < "$PWFILE"
git grep -cF -f "$PWFILE" || echo "no old password remains in the working tree"
```

Expected: `no old password remains in the working tree`. The redaction touches the 2026-09-22 spec, the 2026-09-22 plan and `src/features/auth/sign-in-panel.test.tsx`, where the test value becomes `<redacted>`.

- [ ] **Step 7: Confirm the sign-in panel tests still pass with the redacted value**

Run: `npx vitest run src/features/auth/sign-in-panel.test.tsx`
Expected: PASS, 18 tests.

- [ ] **Step 8: Commit**

```bash
git add scripts/rotate-test-account-passwords.ts scripts/rotate-test-account-passwords.test.ts \
  docs/superpowers/specs/2026-09-22-admin-role-and-password-auth-design.md \
  docs/superpowers/plans/2026-09-22-admin-role-and-password-auth.md \
  src/features/auth/sign-in-panel.test.tsx
git commit -m "chore: read test-account passwords from the environment; redact the old ones"
```

---

### Task 2: Automatic alert engine — location required, yellow only, officials untouched

**Files:**
- Create: `supabase/migrations/<live version>_alert_engine_integrity.sql`
- Modify: `supabase/tests/rls.sql` (append before the final `rollback;`)
- Modify: `src/app/api/threshold-check/route.ts:43-48`
- Test: `src/app/api/threshold-check/route.test.ts`

**Interfaces:**
- Produces: the **SP1 fixtures** block. Every later task's isolated run pastes it. It creates zone `tests-fixture-zone-sp1` (PSGC `990000001`, lat 14.5, lng 121.5) and users `e1000000-0000-4000-8000-0000000000NN` for NN = 01…20.
- Produces: `public.check_and_trigger_alerts()`, same signature and return columns (`zone_id text, severity text, report_count bigint, triggered boolean`).

- [ ] **Step 1: Confirm the fixture ids are unused, then append the SP1 fixtures block and the engine tests**

Run: `grep -n "e1000000-0000-4000-8000\|tests-fixture-zone-sp1\|990000001" supabase/tests/rls.sql`
Expected: no output.

Append to `supabase/tests/rls.sql` immediately before the final `rollback;`:

```sql
-- ===========================================================================
-- Sub-project 1 (2026-09-23): stop the bleeding. SP1 fixtures: one zone and
-- twenty users, used only by the SP1 blocks below. Self-contained, so any SP1
-- block can also run alone as: begin; <this block> <that block> rollback;
-- ===========================================================================
do $$
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id)
    select ('e1000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid
      from generate_series(1, 20) g;
  insert into public.zones
    (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
  values
    ('tests-fixture-zone-sp1', '990000001', 'Test Zone SP1', '{"en":"x","fil":"x"}'::jsonb,
     14.5, 121.5, '[]'::jsonb, '000');
  reset role;
end $$;

-- SP1 engine: only located, non-dry reports count; alerts are yellow and
-- unverified; any active alert is left alone; reports older than the last
-- human decision do not count.
do $$
declare
  z constant text := 'tests-fixture-zone-sp1';
  n int;
  a record;
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  -- alerts_record_cleared is deferred to commit; this suite never commits,
  -- so fire it at statement end instead.
  set constraints all immediate;

  -- E1: three neck-deep reports with no location never trigger.
  insert into public.water_level_reports (zone_id, depth_level, reporter_id)
    select z, 'neck', ('e1000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid
      from generate_series(1, 3) g;
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = z and is_active) then
    raise exception using errcode = 'TSTFL', message = 'E1: reports without a location triggered an alert';
  end if;
  raise notice 'ok E1: reports without a location do not trigger';

  -- E2: three located "dry" reports never trigger.
  insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng)
    select z, 'dry', ('e1000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, 14.5, 121.5
      from generate_series(4, 6) g;
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = z and is_active) then
    raise exception using errcode = 'TSTFL', message = 'E2: dry reports triggered an alert';
  end if;
  raise notice 'ok E2: dry reports do not trigger';

  -- E3: three located knee-deep reports trigger one yellow, unverified alert.
  insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng)
    select z, 'knee', ('e1000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, 14.5, 121.5
      from generate_series(7, 9) g;
  perform * from public.check_and_trigger_alerts();
  select al.severity, al.source, al.message->>'en' as en into a
    from public.alerts al where al.zone_id = z and al.is_active;
  if a.severity is distinct from 'yellow'
     or a.source is distinct from 'auto_crowdsourced'
     or a.en is distinct from 'Advisory — 3 residents report knee-deep water (unverified).' then
    raise exception using errcode = 'TSTFL', message = format('E3: expected an unverified yellow advisory, got %s', a);
  end if;
  raise notice 'ok E3: three located knee-deep reports raise an unverified yellow advisory';

  -- E4: running again does not re-issue (no repeated push).
  perform * from public.check_and_trigger_alerts();
  select count(*) into n from public.alerts where zone_id = z;
  if n <> 1 then
    raise exception using errcode = 'TSTFL', message = format('E4: engine re-issued its own alert (%s rows)', n);
  end if;
  raise notice 'ok E4: no re-issue';

  -- E5: an official's clear is not undone by the reports it has already seen.
  perform public.set_zone_alert(z, null, null, 'manual');
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = z and is_active) then
    raise exception using errcode = 'TSTFL', message = 'E5: engine re-raised an alert an official just cleared';
  end if;
  raise notice 'ok E5: a clear holds';

  -- E6: reports after the decision do count (decision moved one minute back).
  update public.official_actions set occurred_at = now() - interval '1 minute'
   where zone_id = z and action = 'alert.cleared';
  perform * from public.check_and_trigger_alerts();
  if not exists (select 1 from public.alerts where zone_id = z and is_active and severity = 'yellow') then
    raise exception using errcode = 'TSTFL', message = 'E6: reports after the decision did not trigger';
  end if;
  raise notice 'ok E6: reports after a decision count';

  -- E7: an official's alert is never replaced or downgraded.
  perform public.set_zone_alert(z, 'red', '{"en":"r","fil":"r"}'::jsonb, 'manual');
  perform * from public.check_and_trigger_alerts();
  select al.severity, al.source into a from public.alerts al where al.zone_id = z and al.is_active;
  if a.severity is distinct from 'red' or a.source is distinct from 'manual' then
    raise exception using errcode = 'TSTFL', message = format('E7: engine touched an official''s alert: %s', a);
  end if;
  raise notice 'ok E7: official alert untouched';

  -- E8: an active alert from another automatic source is left alone.
  perform public.set_zone_alert(z, 'orange', '{"en":"c","fil":"c"}'::jsonb, 'cascade');
  perform * from public.check_and_trigger_alerts();
  select al.severity, al.source into a from public.alerts al where al.zone_id = z and al.is_active;
  if a.severity is distinct from 'orange' or a.source is distinct from 'cascade' then
    raise exception using errcode = 'TSTFL', message = format('E8: engine replaced a cascade alert: %s', a);
  end if;
  raise notice 'ok E8: other automatic alerts untouched';

  -- E9: reports made before a decision but delivered after it do not count.
  perform public.set_zone_alert(z, null, null, 'manual');
  insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng, reported_at)
    select z, 'knee', ('e1000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid,
           14.5, 121.5, now() - interval '10 minutes'
      from generate_series(10, 12) g;
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = z and is_active) then
    raise exception using errcode = 'TSTFL', message = 'E9: reports made before the decision triggered after it';
  end if;
  raise notice 'ok E9: offline reports made before a decision do not count';

  reset role;
end $$;
```

- [ ] **Step 2: Run the new blocks against the live database to verify they fail**

MCP `execute_sql`: `begin;` + both blocks from Step 1 + `rollback;`.
Expected: ERROR `E1: reports without a location triggered an alert` (the current engine counts every report and can issue `evacuate`).

- [ ] **Step 3: Write and apply the migration**

Create `supabase/migrations/PENDING_alert_engine_integrity.sql`, and apply the same SQL with MCP `apply_migration` name `alert_engine_integrity`:

```sql
-- Sub-project 1 (spec 2026-09-23-stop-the-bleeding-design.md, section 2 and
-- correction 1). Automatic crowd-report alerts:
--   * count only reports carrying a location (the geofence trigger has
--     already checked it) and only non-"dry" reports;
--   * count only reports made strictly after the last human decision for the
--     barangay (an official, or the owner in the SQL editor);
--   * never touch a barangay with ANY active alert. Yellow is the lowest
--     severity, so an active alert is always equal or higher: skipping it
--     is what "never override an official, never downgrade, never re-issue"
--     all reduce to;
--   * are always yellow and say they are unverified.
create or replace function public.check_and_trigger_alerts()
returns table (zone_id text, severity text, report_count bigint, triggered boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min_reporters constant int := 3;
  v_window constant interval := interval '6 hours';
  v_zone record;
  v_since timestamptz;
  v_count bigint;
  v_depth text;
  v_depth_en text;
  v_depth_fil text;
begin
  for v_zone in
    select distinct r.zone_id as id
      from public.water_level_reports r
     where r.reported_at >= now() - v_window
       and not r.is_outlier
       and r.lat is not null and r.lng is not null
       and r.depth_level <> 'dry'
  loop
    if exists (select 1 from public.alerts al where al.zone_id = v_zone.id and al.is_active) then
      zone_id := v_zone.id; severity := null; report_count := 0; triggered := false;
      return next;
      continue;
    end if;

    -- The engine's own entries are recorded as "Automatic — <source>" by
    -- private.record_alert_set; every other alert.set/alert.cleared is a
    -- human decision.
    select max(o.occurred_at) into v_since
      from public.official_actions o
     where o.zone_id = v_zone.id
       and o.action in ('alert.set', 'alert.cleared')
       and o.actor_name not like 'Automatic%';

    select count(distinct r.reporter_id), mode() within group (order by r.depth_level)
      into v_count, v_depth
      from public.water_level_reports r
     where r.zone_id = v_zone.id
       and r.reported_at >= now() - v_window
       and (v_since is null or r.reported_at > v_since)
       and not r.is_outlier
       and r.lat is not null and r.lng is not null
       and r.depth_level <> 'dry';

    if v_count < v_min_reporters then
      zone_id := v_zone.id; severity := null; report_count := v_count; triggered := false;
      return next;
      continue;
    end if;

    v_depth_en := case v_depth
      when 'ankle' then 'ankle-deep' when 'knee' then 'knee-deep'
      when 'waist' then 'waist-deep' when 'neck' then 'neck-deep' end;
    v_depth_fil := case v_depth
      when 'ankle' then 'hanggang bukong-bukong' when 'knee' then 'hanggang tuhod'
      when 'waist' then 'hanggang baywang' when 'neck' then 'hanggang leeg' end;

    perform public.set_zone_alert(
      v_zone.id,
      'yellow',
      jsonb_build_object(
        'en', format('Advisory — %s residents report %s water (unverified).', v_count, v_depth_en),
        'fil', format('Paalala — %s residente ang nag-ulat ng tubig na %s (hindi pa kumpirmado).', v_count, v_depth_fil)
      ),
      'auto_crowdsourced'
    );

    zone_id := v_zone.id; severity := 'yellow'; report_count := v_count; triggered := true;
    return next;
  end loop;
end;
$$;
```

- [ ] **Step 4: Re-run the blocks to verify they pass**

MCP `execute_sql`: `begin;` + both blocks from Step 1 + `rollback;`.
Expected: no error. The response is an empty result (notices are not returned).

- [ ] **Step 5: Name the migration file after its live version**

Run MCP `list_migrations` and find `alert_engine_integrity`'s version, then:

```bash
git mv supabase/migrations/PENDING_alert_engine_integrity.sql supabase/migrations/<version>_alert_engine_integrity.sql
```

- [ ] **Step 6: Write the failing test for the push wording**

In `src/app/api/threshold-check/route.test.ts`, inside the test `"GET runs the real threshold engine and sends push notifications for triggered alerts, not just an echoed config"`, replace:

```typescript
    expect(sendZonePush).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: "zone-1" })
    );
```

with:

```typescript
    expect(sendZonePush).toHaveBeenCalledWith(
      expect.objectContaining({
        zoneId: "zone-1",
        title: "WeatherWell Advisory (unverified)",
        body: "Residents report flooding in your area. Not yet confirmed by an official.",
      })
    );
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/app/api/threshold-check/route.test.ts`
Expected: FAIL. The received title is `WeatherWell Alert — DANGER`.

- [ ] **Step 8: Change the push wording**

In `src/app/api/threshold-check/route.ts`, replace:

```typescript
      title: `WeatherWell Alert — ${alert.severity.toUpperCase()}`,
      body: `Crowd reports indicate ${alert.severity} level flooding in your area.`,
```

with:

```typescript
      // Automatic alerts are always an unverified yellow advisory (see the
      // alert_engine_integrity migration); the push must not claim more.
      title: "WeatherWell Advisory (unverified)",
      body: "Residents report flooding in your area. Not yet confirmed by an official.",
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run src/app/api/threshold-check/route.test.ts`
Expected: PASS, all tests.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/*_alert_engine_integrity.sql supabase/tests/rls.sql \
  src/app/api/threshold-check/route.ts src/app/api/threshold-check/route.test.ts
git commit -m "fix: automatic alerts need located reports, stay yellow, and never override officials"
```

---

### Task 3: Database function permissions

**Files:**
- Create: `supabase/migrations/<live version>_lock_down_public_functions.sql`
- Modify: `supabase/tests/rls.sql` (append before the final `rollback;`)

**Interfaces:**
- Consumes: SP1 fixtures (Task 2).
- Produces: `check_and_trigger_alerts()` and `cleanup_old_weather_readings()` executable only by `service_role`. `get_push_subscriptions_for_zone` and `get_reference_data_compact` no longer exist.

- [ ] **Step 1: Confirm nothing in the app calls the functions being dropped**

Run: `grep -rn "get_push_subscriptions_for_zone\|get_reference_data_compact" src scripts --include=*.ts --include=*.tsx --include=*.mjs | grep -v database.types`
Expected: no output.

Run: `grep -n "SERVICE_ROLE" scripts/fetch-weather.ts src/app/api/cleanup-weather/route.ts src/app/api/threshold-check/route.ts`
Expected: one match in each file. All three callers use the service role.

- [ ] **Step 2: Append the permission tests**

Append to `supabase/tests/rls.sql` immediately before the final `rollback;`:

```sql
-- SP1 permissions (H3): the engine and the cleanup are server-only; the two
-- unused, publicly callable functions are gone.
select tests.as_anon();
select tests.expect_denied('SP1-P1: anon cannot run the alert engine',
  $$select * from public.check_and_trigger_alerts()$$);
select tests.expect_denied('SP1-P2: anon cannot run the weather cleanup',
  $$select public.cleanup_old_weather_readings()$$);
select tests.as_user('e1000000-0000-4000-8000-000000000001');
select tests.expect_denied('SP1-P3: a signed-in resident cannot run the alert engine',
  $$select * from public.check_and_trigger_alerts()$$);
select tests.expect_denied('SP1-P4: a signed-in resident cannot run the weather cleanup',
  $$select public.cleanup_old_weather_readings()$$);

do $$
begin
  if not has_function_privilege('service_role', 'public.check_and_trigger_alerts()', 'execute')
     or not has_function_privilege('service_role', 'public.cleanup_old_weather_readings()', 'execute') then
    raise exception using errcode = 'TSTFL',
      message = 'SP1-P5: the scheduled jobs (service_role) lost access to the engine or the cleanup';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('get_push_subscriptions_for_zone', 'get_reference_data_compact')) then
    raise exception using errcode = 'TSTFL',
      message = 'SP1-P6: an unused, publicly callable function still exists';
  end if;
  raise notice 'ok SP1-P5/P6';
end $$;
```

- [ ] **Step 3: Run it in isolation to verify it fails**

MCP `execute_sql`: `begin;` + SP1 fixtures block + the Step 2 block + `rollback;`.
Expected: ERROR `SECURITY TEST FAILED — expected denial, statement succeeded: SP1-P1: anon cannot run the alert engine`.

- [ ] **Step 4: Write and apply the migration**

Create `supabase/migrations/PENDING_lock_down_public_functions.sql`, and apply it with MCP `apply_migration` name `lock_down_public_functions`:

```sql
-- Sub-project 1, section 3 and correction 2. Neither function below is
-- called by the app; both were executable by anyone holding the public key.
-- get_push_subscriptions_for_zone returned every subscriber's push endpoint
-- and keys; get_reference_data_compact returned the whole nationwide
-- dataset per call.
drop function if exists public.get_push_subscriptions_for_zone(text);
drop function if exists public.get_reference_data_compact();

-- Scheduled jobs call these with the service-role key; nobody else may.
revoke execute on function public.check_and_trigger_alerts() from public, anon, authenticated;
grant execute on function public.check_and_trigger_alerts() to service_role;

create or replace function public.cleanup_old_weather_readings()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.weather_readings where fetched_at < now() - interval '48 hours';
$$;
revoke execute on function public.cleanup_old_weather_readings() from public, anon, authenticated;
grant execute on function public.cleanup_old_weather_readings() to service_role;
```

- [ ] **Step 5: Re-run in isolation to verify it passes**

MCP `execute_sql`: `begin;` + SP1 fixtures block + the Step 2 block + `rollback;`.
Expected: no error.

- [ ] **Step 6: Check the advisor**

Run MCP `get_advisors` (type `security`).
Expected: neither `anon_security_definer_function_executable` nor `authenticated_security_definer_function_executable` lists `check_and_trigger_alerts`, `cleanup_old_weather_readings` or `get_push_subscriptions_for_zone`. `report_app_error` and `recent_app_error_count` stay listed; they are intentionally public. `function_search_path_mutable` no longer lists any of the four functions this task touched or dropped.

- [ ] **Step 7: Name the migration file after its live version, and commit**

Run MCP `list_migrations` for `lock_down_public_functions`'s version, then:

```bash
git mv supabase/migrations/PENDING_lock_down_public_functions.sql supabase/migrations/<version>_lock_down_public_functions.sql
git add supabase/migrations/*_lock_down_public_functions.sql supabase/tests/rls.sql
git commit -m "fix: make the alert engine and cleanup server-only; drop two unused public functions"
```

---

### Task 4: Report privacy — hide GPS and reporter ids

**Files:**
- Create: `supabase/migrations/<live version>_hide_report_locations.sql`
- Modify: `supabase/tests/rls.sql` (append before the final `rollback;`)
- Modify: `src/test-utils/mock-supabase-query.ts` (add `fakeSupabaseRpc`)
- Modify: `src/app/resident/page.tsx:15-18`, `src/app/resident/page.test.tsx`
- Modify: `src/app/resident/reports/page.tsx:9-14`, `src/app/resident/reports/page.test.tsx`
- Modify: `src/app/api/reports/route.ts:16,35`, `src/lib/water-level-reports.ts:20-21,186-189`
- Create: `src/app/api/reports/route.test.ts`
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: SP1 fixtures (Task 2).
- Produces: `public.my_water_level_reports()` returning `(id uuid, zone_id text, depth_level text, reported_at timestamptz)`, newest first, callable by `authenticated` only.
- Produces: `fakeSupabaseRpc(resultsByFunction: Record<string, FakeQueryResult>): { rpc }` in `src/test-utils/mock-supabase-query.ts`.
- Changes: `LiveWaterLevelReport` loses `reporterId`.

- [ ] **Step 1: Append the privacy tests**

Append to `supabase/tests/rls.sql` immediately before the final `rollback;`:

```sql
-- SP1 report privacy (widened M3): nobody reads a report's GPS position or
-- who filed it; a resident reads their own reports through
-- my_water_level_reports(); filing a report still works.
do $$
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  insert into public.water_level_reports (id, zone_id, depth_level, reporter_id, lat, lng)
    values ('e2000000-0000-4000-8000-000000000001', 'tests-fixture-zone-sp1', 'waist',
            'e1000000-0000-4000-8000-000000000013', 14.5, 121.5);
  reset role;
end $$;

select tests.as_anon();
select tests.expect_denied('SP1-R1: anon cannot read report GPS',
  $$select lat, lng from public.water_level_reports$$);
select tests.expect_denied('SP1-R2: anon cannot read who filed a report',
  $$select reporter_id from public.water_level_reports$$);
select tests.expect_allowed('SP1-R3: anon still reads the public report fields',
  $$select id, zone_id, depth_level, reported_at, trust_weight, is_outlier from public.water_level_reports$$);

select tests.as_user('e1000000-0000-4000-8000-000000000014');
select tests.expect_denied('SP1-R4: a signed-in resident cannot read report GPS either',
  $$select lat, lng from public.water_level_reports$$);
select tests.expect_allowed('SP1-R5: a resident can still file a located report',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng)
    values ('tests-fixture-zone-sp1', 'ankle', 'e1000000-0000-4000-8000-000000000014', 14.5, 121.5)$$);

do $$
declare
  mine int;
  others int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e1000000-0000-4000-8000-000000000013', 'role', 'authenticated')::text, true);
  select count(*) into mine from public.my_water_level_reports()
   where id = 'e2000000-0000-4000-8000-000000000001';
  select count(*) into others from public.my_water_level_reports()
   where id <> 'e2000000-0000-4000-8000-000000000001';
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if mine <> 1 or others <> 0 then
    raise exception using errcode = 'TSTFL',
      message = format('SP1-R6: my_water_level_reports returned own=%s others=%s, expected 1 and 0', mine, others);
  end if;
  raise notice 'ok SP1-R6: a resident sees exactly their own reports';
end $$;
```

- [ ] **Step 2: Run it in isolation to verify it fails**

MCP `execute_sql`: `begin;` + SP1 fixtures block + the Step 1 block + `rollback;`.
Expected: ERROR `SECURITY TEST FAILED — expected denial, statement succeeded: SP1-R1: anon cannot read report GPS`.

- [ ] **Step 3: Write and apply the migration**

Create `supabase/migrations/PENDING_hide_report_locations.sql`, and apply it with MCP `apply_migration` name `hide_report_locations`:

```sql
-- Sub-project 1, section 4 and correction 3. Anyone holding the public key
-- could read every water-level report's exact GPS position and reporter id.
-- Postgres ignores a column-level REVOKE while a table-level SELECT grant
-- exists, so the table grant goes and the public columns come back
-- one by one.
revoke select on public.water_level_reports from anon, authenticated;
grant select (id, zone_id, depth_level, reported_at, trust_weight, is_outlier)
  on public.water_level_reports to anon, authenticated;

-- A resident's own reports, for the /resident pages.
create or replace function public.my_water_level_reports()
returns table (id uuid, zone_id text, depth_level text, reported_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.zone_id, r.depth_level, r.reported_at
    from public.water_level_reports r
   where r.reporter_id = (select auth.uid())
   order by r.reported_at desc
$$;
revoke execute on function public.my_water_level_reports() from public, anon;
grant execute on function public.my_water_level_reports() to authenticated;
```

- [ ] **Step 4: Re-run in isolation to verify it passes**

MCP `execute_sql`: `begin;` + SP1 fixtures block + the Step 1 block + `rollback;`.
Expected: no error.

- [ ] **Step 5: Name the migration file after its live version, and regenerate the database types**

Run MCP `list_migrations` for `hide_report_locations`'s version, then:

```bash
git mv supabase/migrations/PENDING_hide_report_locations.sql supabase/migrations/<version>_hide_report_locations.sql
```

Run MCP `generate_typescript_types`. Replace everything in `src/lib/supabase/database.types.ts` **below** its 9-line header comment with the tool's output.
Expected: `Functions` now contains `my_water_level_reports` and no longer contains `get_push_subscriptions_for_zone` or `get_reference_data_compact`.

- [ ] **Step 6: Add the rpc fake to the test utilities**

Append to `src/test-utils/mock-supabase-query.ts`:

```typescript
/**
 * The `.rpc(fn)` counterpart of fakeSupabaseFrom: `order`/`limit` return the
 * chain, and awaiting it resolves to the result configured for that
 * function. An unconfigured function resolves to an error, so a page calling
 * the wrong one fails loudly.
 */
export function fakeSupabaseRpc(resultsByFunction: Record<string, FakeQueryResult>) {
  const rpc = vi.fn((fn: string) => {
    const result: FakeQueryResult = resultsByFunction[fn] ?? {
      data: null,
      error: { message: `unexpected rpc ${fn}` },
    };
    const chain: Record<string, unknown> = {
      order: () => chain,
      limit: () => chain,
      then: (resolve: (value: FakeQueryResult) => void) => resolve(result),
    };
    return chain;
  });
  return { rpc };
}
```

- [ ] **Step 7: Write the failing tests for the two resident pages**

In `src/app/resident/page.test.tsx`, change the import line to:

```typescript
import { fakeSupabaseFrom, fakeSupabaseRpc } from "@/test-utils/mock-supabase-query";
```

and replace the whole `vi.mock("@/lib/supabase/user-server", …)` call with:

```typescript
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user-1" } } }) },
    ...fakeSupabaseFrom({
      profiles: { data: { zone_id: "zone-1" }, error: null },
      // The table can no longer be filtered by reporter_id; a page that still
      // reads it would show this 99 instead of the rpc's 3 rows.
      water_level_reports: { data: null, error: null, count: 99 },
      community_pins: { data: null, error: null, count: 1 },
      evacuation_check_ins: { data: null, error: null, count: 2 },
      zones: { data: { name: "Barangay Poblacion, Mangaldan" }, error: null },
    }),
    ...fakeSupabaseRpc({
      my_water_level_reports: { data: [{ id: "r1" }, { id: "r2" }, { id: "r3" }], error: null },
    }),
  }),
}));
```

In `src/app/resident/reports/page.test.tsx`, change the import line to:

```typescript
import { fakeSupabaseFrom, fakeSupabaseRpc } from "@/test-utils/mock-supabase-query";
```

and replace the whole `vi.mock("@/lib/supabase/user-server", …)` call with:

```typescript
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user-1" } } }) },
    ...fakeSupabaseFrom({
      // A page that still reads the table directly would show "Neck-deep".
      water_level_reports: {
        data: [{ id: "r9", zone_id: "zone-1", depth_level: "neck", reported_at: "2026-09-01T00:00:00Z" }],
        error: null,
      },
      zones: { data: [{ id: "zone-1", name: "Barangay Nilombot" }], error: null },
    }),
    ...fakeSupabaseRpc({
      my_water_level_reports: {
        data: [{ id: "r1", zone_id: "zone-1", depth_level: "knee", reported_at: "2026-09-01T00:00:00Z" }],
        error: null,
      },
    }),
  }),
}));
```

and add this assertion at the end of its existing test, after the `expect(screen.queryByText("zone-1"))…` line:

```typescript
    expect(screen.queryByText("Neck-deep")).not.toBeInTheDocument();
```

- [ ] **Step 8: Run them to verify they fail**

Run: `npx vitest run src/app/resident/page.test.tsx src/app/resident/reports/page.test.tsx`
Expected: FAIL. The overview's Reports card shows `99`, not `3`. The reports page shows `Neck-deep` and not `Knee-deep`.

- [ ] **Step 9: Switch both pages to the rpc**

In `src/app/resident/page.tsx`, replace:

```typescript
  const { count: reportCount } = await supabase
    .from("water_level_reports")
    .select("*", { count: "exact", head: true })
    .eq("reporter_id", userId!);
```

with:

```typescript
  // reporter_id is no longer readable (it links one device's reports
  // together); a resident's own reports come through this function instead.
  const { data: myReports } = await supabase.rpc("my_water_level_reports");
```

and replace `reportCount={reportCount ?? 0}` with `reportCount={myReports?.length ?? 0}`.

In `src/app/resident/reports/page.tsx`, replace:

```typescript
  const { data: reports } = await supabase
    .from("water_level_reports")
    .select("id, zone_id, depth_level, reported_at")
    .eq("reporter_id", userId!)
    .order("reported_at", { ascending: false })
    .limit(50);
```

with:

```typescript
  // reporter_id is no longer readable (it links one device's reports
  // together); a resident's own reports come through this function instead.
  const { data: reports } = await supabase
    .rpc("my_water_level_reports")
    .order("reported_at", { ascending: false })
    .limit(50);
```

`userId` is no longer used in `reports/page.tsx`. Delete its two declaration lines (`const { data } = await supabase.auth.getClaims();` and `const userId = data?.claims?.sub;`).

- [ ] **Step 10: Run them to verify they pass**

Run: `npx vitest run src/app/resident`
Expected: PASS, all tests.

- [ ] **Step 11: Write the failing test for `/api/reports`**

Create `src/app/api/reports/route.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

const selectedColumns = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({
      select: (columns: string) => {
        selectedColumns(columns);
        return {
          order: () => ({
            limit: async () => ({
              data: [
                {
                  id: "r1",
                  zone_id: "zone-1",
                  depth_level: "knee",
                  reported_at: "2026-09-01T00:00:00Z",
                  trust_weight: 1,
                  is_outlier: false,
                },
              ],
              error: null,
            }),
          }),
        };
      },
    }),
  }),
}));

import { GET } from "./route";

describe("GET /api/reports", () => {
  it("never asks for, or returns, who filed a report or where they stood", async () => {
    const body = await (await GET()).json();

    expect(selectedColumns.mock.calls[0][0]).not.toMatch(/reporter_id|\blat\b|\blng\b/);
    expect(body[0]).not.toHaveProperty("reporterId");
    expect(body[0]).toMatchObject({ id: "r1", zoneId: "zone-1", depthLevel: "knee" });
  });
});
```

- [ ] **Step 12: Run it to verify it fails**

Run: `npx vitest run src/app/api/reports/route.test.ts`
Expected: FAIL. The selected columns contain `reporter_id`.

- [ ] **Step 13: Remove `reporter_id` from the route and the type**

In `src/app/api/reports/route.ts`, change the select to:

```typescript
    .select("id, zone_id, depth_level, reported_at, trust_weight, is_outlier")
```

and delete the line `    reporterId: row.reporter_id,`.

In `src/lib/water-level-reports.ts`, delete these two lines from `LiveWaterLevelReport`:

```typescript
  /** The authenticated (anonymous) user who filed this — see anonymous-session.ts. */
  reporterId: string;
```

and delete these lines from the optimistic-row mapping:

```typescript
        // Not yet known: attribution happens at replay (see
        // useOutboxDrain), not at queue time. "pending" is never shown —
        // no consumer of LiveWaterLevelReport reads reporterId today.
        reporterId: "pending",
```

- [ ] **Step 14: Run the route test, the report tests, and the typechecker**

Run: `npx vitest run src/app/api/reports src/lib/water-level-reports.test.ts src/features/water-level-report`
Expected: PASS.

Run: `npm run typecheck`
Expected: clean. If a test fixture still sets `reporterId`, delete that property; the type no longer has it.

- [ ] **Step 15: Commit**

```bash
git add supabase/migrations/*_hide_report_locations.sql supabase/tests/rls.sql \
  src/test-utils/mock-supabase-query.ts src/app/resident src/app/api/reports \
  src/lib/water-level-reports.ts src/lib/supabase/database.types.ts
git add -u src
git commit -m "fix: hide water-level reports' GPS position and reporter id from the public key"
```

---

### Task 5: Push targeting — every subscription names its barangay

**Files:**
- Create: `supabase/migrations/<live version>_push_subscriptions_need_zone.sql`
- Modify: `supabase/tests/rls.sql` (append before the final `rollback;`)
- Modify: `src/lib/send-zone-push.ts:27-28,52-58`, `src/lib/send-zone-push.test.ts`
- Modify: `src/lib/push-subscription.ts:63-107`
- Create: `src/lib/push-subscription.test.ts`

**Interfaces:**
- Consumes: SP1 fixtures (Task 2). `ensureAnonymousSession(): Promise<string | null>` from `src/lib/auth/anonymous-session.ts` (existing).
- Produces: `push_subscriptions.zone_id NOT NULL`, with its foreign key `on delete cascade`.

- [ ] **Step 1: Read the real foreign-key name**

MCP `execute_sql`:

```sql
select conname from pg_constraint
 where conrelid = 'public.push_subscriptions'::regclass and contype = 'f'
   and pg_get_constraintdef(oid) like '%(zone_id)%';
```

Expected: one row. The steps below write it as `push_subscriptions_zone_id_fkey`; use the actual name if it differs.

- [ ] **Step 2: Append the database test**

Append to `supabase/tests/rls.sql` immediately before the final `rollback;`:

```sql
-- SP1 push targeting (H4): a subscription with no barangay used to receive
-- every barangay's alerts. The database now refuses one.
do $$
begin
  set local role postgres;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, zone_id)
      values ('e1000000-0000-4000-8000-000000000015', 'https://push.example/sp1', 'k', 'a', null);
    reset role;
    raise exception using errcode = 'TSTFL', message = 'SP1-S1: a push subscription with no barangay was accepted';
  exception when not_null_violation then
    raise notice 'ok SP1-S1: a subscription must name its barangay';
  end;
  reset role;
end $$;
```

- [ ] **Step 3: Run it in isolation to verify it fails**

MCP `execute_sql`: `begin;` + SP1 fixtures block + the Step 2 block + `rollback;`.
Expected: ERROR `SP1-S1: a push subscription with no barangay was accepted`.

- [ ] **Step 4: Write and apply the migration**

Create `supabase/migrations/PENDING_push_subscriptions_need_zone.sql`, and apply it with MCP `apply_migration` name `push_subscriptions_need_zone`:

```sql
-- Sub-project 1, section 5 and correction 4. A subscription without a
-- barangay received every barangay's alerts. 0 rows exist today, so the
-- column can become NOT NULL directly. "on delete set null" contradicts
-- NOT NULL, so a deleted zone now takes its subscriptions with it.
alter table public.push_subscriptions drop constraint push_subscriptions_zone_id_fkey;
alter table public.push_subscriptions
  add constraint push_subscriptions_zone_id_fkey
  foreign key (zone_id) references public.zones (id) on delete cascade;
alter table public.push_subscriptions alter column zone_id set not null;

drop index if exists public.push_subscriptions_zone_idx;
create index push_subscriptions_zone_idx on public.push_subscriptions (zone_id);
```

- [ ] **Step 5: Re-run in isolation to verify it passes**

MCP `execute_sql`: `begin;` + SP1 fixtures block + the Step 2 block + `rollback;`.
Expected: no error.

- [ ] **Step 6: Name the migration file after its live version**

Run MCP `list_migrations` for `push_subscriptions_need_zone`'s version, then:

```bash
git mv supabase/migrations/PENDING_push_subscriptions_need_zone.sql supabase/migrations/<version>_push_subscriptions_need_zone.sql
```

- [ ] **Step 7: Write the failing test for the push sender**

In `src/lib/send-zone-push.test.ts`, rename the mock so it matches the new query:

```bash
sed -i 's/\bor\b\.mock/selectEq.mock/g; s/^const or = vi.fn();/const selectEq = vi.fn();/; s/select: vi.fn(() => ({ or }))/select: vi.fn(() => ({ eq: selectEq }))/' src/lib/send-zone-push.test.ts
grep -n "selectEq\|\bor\b" src/lib/send-zone-push.test.ts
```

Expected: `selectEq` on the declaration, in the `select` mock and in every `mockResolvedValue` line. No standalone `or` identifier remains outside comments.

Then add this test inside `describe("sendZonePush", …)`:

```typescript
  it("sends only to the zone's own subscribers, never to zone-less ones", async () => {
    const sendZonePush = await freshSendZonePush();

    await sendZonePush(VALID_PAYLOAD);

    expect(selectEq).toHaveBeenCalledWith("zone_id", "zone-1");
  });
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run src/lib/send-zone-push.test.ts`
Expected: FAIL. The query still calls `.or(...)`, which the mock no longer provides.

- [ ] **Step 9: Query by zone only**

In `src/lib/send-zone-push.ts`, replace:

```typescript
    .or(`zone_id.eq.${payload.zoneId},zone_id.is.null`)) as {
```

with:

```typescript
    .eq("zone_id" as never, payload.zoneId)) as {
```

and in the function's doc comment replace `Sends a Web Push notification to every subscriber of a zone (plus` / `zone-less general subscribers).` with `Sends a Web Push notification to every subscriber of a zone.`

- [ ] **Step 10: Run it to verify it passes**

Run: `npx vitest run src/lib/send-zone-push.test.ts`
Expected: PASS, all tests.

- [ ] **Step 11: Write the failing tests for subscribing**

Create `src/lib/push-subscription.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const upsert = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ from: () => ({ upsert }) }),
}));

const ensureAnonymousSession = vi.fn();
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: () => ensureAnonymousSession(),
}));

import { usePushSubscription } from "./push-subscription";

const fakeSubscription = {
  endpoint: "https://push.example/1",
  toJSON: () => ({ endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } }),
};
const pushManager = { subscribe: vi.fn(), getSubscription: vi.fn() };
const requestPermission = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  pushManager.subscribe.mockResolvedValue(fakeSubscription);
  pushManager.getSubscription.mockResolvedValue(null);
  requestPermission.mockResolvedValue("granted");
  upsert.mockResolvedValue({ error: null });
  ensureAnonymousSession.mockResolvedValue("user-1");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AAAA");
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", { permission: "default", requestPermission });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("usePushSubscription", () => {
  it("does nothing without a barangay, so no subscription can receive every barangay's alerts", async () => {
    const { result } = renderHook(() => usePushSubscription(undefined));

    await act(() => result.current.subscribe());

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("signs in anonymously if needed and saves the subscription under its barangay", async () => {
    const { result } = renderHook(() => usePushSubscription("zone-1"));

    await act(() => result.current.subscribe());

    expect(ensureAnonymousSession).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", zone_id: "zone-1", endpoint: "https://push.example/1" }),
      { onConflict: "user_id,endpoint" }
    );
    expect(result.current.state.subscription).toBe(fakeSubscription);
  });

  it("does not report subscribed when there is no session to save it under (offline)", async () => {
    ensureAnonymousSession.mockResolvedValue(null);
    const { result } = renderHook(() => usePushSubscription("zone-1"));

    await act(() => result.current.subscribe());

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(result.current.state.subscription).toBeNull();
  });

  it("does not report subscribed when saving fails", async () => {
    upsert.mockResolvedValue({ error: { message: "permission denied" } });
    const { result } = renderHook(() => usePushSubscription("zone-1"));

    await act(() => result.current.subscribe());

    expect(result.current.state.subscription).toBeNull();
  });
});
```

- [ ] **Step 12: Run them to verify they fail**

Run: `npx vitest run src/lib/push-subscription.test.ts`
Expected: FAIL. Today's hook subscribes without a barangay and then calls `getBrowserClient().auth.getUser()`, which this mock does not provide, so the tests error or see `pushManager.subscribe` called and `ensureAnonymousSession` never called.

- [ ] **Step 13: Rewrite `subscribe`**

In `src/lib/push-subscription.ts`, add the import:

```typescript
import { ensureAnonymousSession } from "@/lib/auth/anonymous-session";
```

and replace the whole `const subscribe = useCallback(async () => { … }, [zoneId]);` block with:

```typescript
  const subscribe = useCallback(async () => {
    // Without a barangay there is nothing to target: the column is NOT NULL,
    // and a zone-less subscription used to receive every barangay's alerts.
    if (!zoneId) return;

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.error("VAPID public key not configured");
      return;
    }

    // A resident who has never filed a report has no session yet, and
    // without one the subscription had nowhere to be saved: it was silently
    // dropped. Asking before the permission prompt also means an offline
    // resident is never shown "subscribed" for a subscription that was not
    // saved.
    const userId = await ensureAnonymousSession();
    if (!userId) return;

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const { endpoint, keys } = sub.toJSON();
    const { error } = await getBrowserClient()
      .from("push_subscriptions" as never)
      .upsert(
        {
          user_id: userId,
          endpoint: endpoint ?? "",
          p256dh: keys?.p256dh ?? "",
          auth: keys?.auth ?? "",
          zone_id: zoneId,
          user_agent: navigator.userAgent,
        } as never,
        { onConflict: "user_id,endpoint" } as never
      );
    if (error) return;

    setSubscription(sub);
  }, [zoneId]);
```

- [ ] **Step 14: Run them to verify they pass**

Run: `npx vitest run src/lib/push-subscription.test.ts src/lib/send-zone-push.test.ts src/features/onboarding`
Expected: PASS, all tests.

- [ ] **Step 15: Commit**

```bash
git add supabase/migrations/*_push_subscriptions_need_zone.sql supabase/tests/rls.sql \
  src/lib/send-zone-push.ts src/lib/send-zone-push.test.ts \
  src/lib/push-subscription.ts src/lib/push-subscription.test.ts
git commit -m "fix: push goes only to a barangay's own subscribers, and subscribing actually saves"
```

---

### Task 6: Error-log storage cap

**Files:**
- Create: `supabase/migrations/<live version>_app_errors_total_cap.sql`
- Modify: `supabase/tests/rls.sql` (append before the final `rollback;`)

**Interfaces:**
- Produces: `public.report_app_error(...)`, same signature, now also skipping the insert once `app_errors` holds 5,000 rows.

- [ ] **Step 1: Append the test**

Append to `supabase/tests/rls.sql` immediately before the final `rollback;`:

```sql
-- SP1 error-log cap (L3, correction 5): 300/hour x 30-day retention allowed
-- ~216,000 rows (~1 GB). A 5,000-row total cap bounds it. Fillers are two
-- hours old so the existing hourly cap cannot be what refuses the call.
do $$
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  delete from public.app_errors;
  insert into public.app_errors (occurred_at, source, kind, message, route, environment, fingerprint)
    select now() - interval '2 hours', 'client', 'unhandled', 'fill', '/', 'preview', 'sp1-fill-' || g
      from generate_series(1, 4999) g;
  reset role;
end $$;

select tests.as_anon();
select tests.expect_allowed('SP1-E1: the 5,000th row is still accepted',
  $$select public.report_app_error('client','unhandled','under cap', null,'/','preview', null,'fp-sp1-a')$$);
select tests.expect_allowed('SP1-E2: a call past the total cap succeeds without storing',
  $$select public.report_app_error('client','unhandled','over cap', null,'/','preview', null,'fp-sp1-b')$$);

do $$
begin
  set local role postgres;
  if not exists (select 1 from public.app_errors where fingerprint = 'fp-sp1-a') then
    reset role;
    raise exception using errcode = 'TSTFL', message = 'SP1-E1: the row under the total cap was not stored';
  end if;
  if exists (select 1 from public.app_errors where fingerprint = 'fp-sp1-b') then
    reset role;
    raise exception using errcode = 'TSTFL', message = 'SP1-E2: a row was stored beyond the 5,000-row total cap';
  end if;
  reset role;
  raise notice 'ok SP1-E1/E2: the error log is capped at 5,000 rows';
end $$;
```

- [ ] **Step 2: Run it in isolation to verify it fails**

MCP `execute_sql`: `begin;` + the Step 1 block + `rollback;` (no SP1 fixtures needed).
Expected: ERROR `SP1-E2: a row was stored beyond the 5,000-row total cap`.

- [ ] **Step 3: Write and apply the migration**

Create `supabase/migrations/PENDING_app_errors_total_cap.sql`, and apply it with MCP `apply_migration` name `app_errors_total_cap`. The body is the live function plus one check:

```sql
-- Sub-project 1, correction 5. The existing 5-minute de-duplication and
-- 300/hour cap stay; a 5,000-row total cap is added so the table cannot grow
-- past a few tens of MB on the free tier.
create or replace function public.report_app_error(
  p_source text, p_kind text, p_message text, p_stack text,
  p_route text, p_environment text, p_release text, p_fingerprint text
)
returns void
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

  if (select count(*) from public.app_errors) >= 5000 then
    return;
  end if;

  insert into public.app_errors (source, kind, message, stack, route, environment, release, fingerprint)
  values (p_source, p_kind, left(coalesce(p_message, ''), 500), left(p_stack, 4000),
          left(coalesce(p_route, '/'), 200), p_environment, left(p_release, 64), left(p_fingerprint, 64));
exception when others then
  return;
end;
$$;
```

- [ ] **Step 4: Re-run in isolation to verify it passes**

MCP `execute_sql`: `begin;` + the Step 1 block + `rollback;`.
Expected: no error.

- [ ] **Step 5: Confirm the grants survived `create or replace`**

MCP `execute_sql`:

```sql
select has_function_privilege('anon', 'public.report_app_error(text,text,text,text,text,text,text,text)', 'execute') as anon_can_report;
```

Expected: `true`. The app reports its own crashes before any sign-in.

- [ ] **Step 6: Name the migration file after its live version, and commit**

Run MCP `list_migrations` for `app_errors_total_cap`'s version, then:

```bash
git mv supabase/migrations/PENDING_app_errors_total_cap.sql supabase/migrations/<version>_app_errors_total_cap.sql
git add supabase/migrations/*_app_errors_total_cap.sql supabase/tests/rls.sql
git commit -m "fix: cap the error log at 5,000 rows so it cannot fill the free-tier database"
```

---

### Task 7: Mark automatic alerts as unverified on the alert card

**Files:**
- Modify: `src/features/alerts/alert-card.tsx`
- Test: `src/features/alerts/alert-card.test.tsx`

**Interfaces:**
- Consumes: `AlertRecord.source: "manual" | "auto_crowdsourced" | "predicted" | "cascade"` (existing, `src/lib/types.ts:30`).

- [ ] **Step 1: Write the failing tests**

Add inside `describe("AlertCard", …)` in `src/features/alerts/alert-card.test.tsx`:

```typescript
  it("marks an automatic crowd-report alert as unverified", () => {
    render(<AlertCard alert={{ ...alert, source: "auto_crowdsourced" }} zone={zone} />);
    expect(
      screen.getByText("Unverified — based on residents' reports, not yet confirmed by an official.")
    ).toBeInTheDocument();
  });

  it("shows the unverified note in Filipino too", () => {
    render(
      <LanguageProvider initialLang="fil">
        <AlertCard alert={{ ...alert, source: "auto_crowdsourced" }} zone={zone} />
      </LanguageProvider>
    );
    expect(
      screen.getByText("Hindi pa kumpirmado — batay sa ulat ng mga residente, hindi pa napapatunayan ng opisyal.")
    ).toHaveAttribute("lang", "fil");
  });

  it("does not mark an official's alert as unverified", () => {
    render(<AlertCard alert={{ ...alert, source: "manual" }} zone={zone} />);
    expect(screen.queryByText(/not yet confirmed by an official/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/alerts/alert-card.test.tsx`
Expected: FAIL. The unverified text is not found (2 failures). The "official's alert" test passes already.

- [ ] **Step 3: Implement**

In `src/features/alerts/alert-card.tsx`, add after `NO_ACTIVE_ALERT`:

```typescript
const UNVERIFIED: LocalizedText = {
  en: "Unverified — based on residents' reports, not yet confirmed by an official.",
  fil: "Hindi pa kumpirmado — batay sa ulat ng mga residente, hindi pa napapatunayan ng opisyal.",
};
```

and insert immediately after the `{alert.predictedTiming && ( … )}` block:

```tsx
            {alert.source === "auto_crowdsourced" && (
              <p lang={lang} className="text-sm text-muted-foreground">
                {t(UNVERIFIED, lang)}
              </p>
            )}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/features/alerts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/alerts/alert-card.tsx src/features/alerts/alert-card.test.tsx
git commit -m "feat: label automatic crowd-report alerts as unverified"
```

---

### Task 8: Repair the four `rls.sql` blocks from 2026-09-22

**Files:**
- Modify: `supabase/tests/rls.sql` (the four blocks after the comment `-- Regression for the live bug found during Task 8 verification`)

**Interfaces:**
- Consumes: the 2026-09-22 fixtures `d0000000-0000-4000-8000-000000000001` (admin) and `…0002` (resident), created earlier in the file.

- [ ] **Step 1: Show the current blocks are broken**

MCP `execute_sql`, one call:

```sql
begin;
do $$
begin
  insert into auth.users (id) values ('d0000000-0000-4000-8000-000000000001'), ('d0000000-0000-4000-8000-000000000002');
  update public.profiles set role = 'admin', display_name = 'Test Admin' where id = 'd0000000-0000-4000-8000-000000000001';
end $$;
select tests.as_user('d0000000-0000-4000-8000-000000000002');
do $$
declare seen boolean;
begin
  select exists(select 1 from public.profiles where id = 'd0000000-0000-4000-8000-000000000001') into seen;
  if seen then
    raise exception using errcode = 'TSTFL', message = 'a non-admin could read another profile row';
  end if;
end $$;
rollback;
```

Expected: ERROR `a non-admin could read another profile row`. The block runs as `postgres`, which sees every row, so the whole suite fails here even though the policy is correct.

- [ ] **Step 2: Replace the four blocks**

In `supabase/tests/rls.sql`, replace everything from the line `-- Regression for the live bug found during Task 8 verification` through the second admin-demotion block's closing `end $$;` (the last statement before the SP1 section) with:

```sql
-- Regression for the live bug found during 2026-09-22 Task 8 verification:
-- profiles' only SELECT policy was self-only, so /admin/officials listed no
-- one. tests.as_user() does not switch roles for a plain block, so these
-- switch explicitly (repaired in sub-project 1).
do $$
declare
  seen boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'd0000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
  select exists(select 1 from public.profiles where id = 'd0000000-0000-4000-8000-000000000002') into seen;
  reset role;
  if not seen then
    raise exception using errcode = 'TSTFL',
      message = 'admin could not read another profile row (profiles_read_own_or_admin regressed)';
  end if;
  raise notice 'ok: admin can read another profile row';
end $$;

do $$
declare
  seen boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'd0000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
  select exists(select 1 from public.profiles where id = 'd0000000-0000-4000-8000-000000000001') into seen;
  reset role;
  if seen then
    raise exception using errcode = 'TSTFL',
      message = 'a non-admin could read another profile row (profiles_read_own_or_admin over-widened)';
  end if;
  raise notice 'ok: a non-admin still cannot read another profile row';
end $$;

-- Regression for a 2026-09-22 final-review finding: an admin could use the
-- appoint form on an admin account (here, a self-demote attempt). Only the
-- guard's own message counts as a pass; any other error fails the test.
update auth.users set email = 'admin-fixture@example.com' where id = 'd0000000-0000-4000-8000-000000000001';

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'd0000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
  begin
    perform public.admin_appoint_official('admin-fixture@example.com', 'Mapandan', 'Self Demote');
    raise exception using errcode = 'TSTFL',
      message = 'admin_appoint_official let an admin demote an admin';
  exception when others then
    if sqlerrm not like 'That account is an admin%' then
      raise exception using errcode = 'TSTFL',
        message = format('admin_appoint_official failed for the wrong reason: %s', sqlerrm);
    end if;
  end;
  begin
    perform public.admin_remove_official('admin-fixture@example.com');
    raise exception using errcode = 'TSTFL',
      message = 'admin_remove_official let an admin remove an admin';
  exception when others then
    if sqlerrm not like 'That account is an admin%' then
      raise exception using errcode = 'TSTFL',
        message = format('admin_remove_official failed for the wrong reason: %s', sqlerrm);
    end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'ok: neither admin RPC touches an admin account';
end $$;
```

- [ ] **Step 3: Run the repaired blocks in isolation to verify they pass**

MCP `execute_sql`: `begin;` + the fixture `do` block from Step 1 + the whole Step 2 text + `rollback;`.
Expected: no error.

- [ ] **Step 4: Prove the admin-demotion check can now fail**

MCP `execute_sql`: the same text as Step 3, but with `'That account is an admin%'` changed to `'Something else%'` in the first `if`.
Expected: ERROR `admin_appoint_official failed for the wrong reason: That account is an admin; …`. This shows the check tests the message and no longer passes on any error.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/rls.sql
git commit -m "test: make the 2026-09-22 profile and admin-demotion RLS checks actually test something"
```

---

### Task 9: Full gate and live attack verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite, types, lint, dead code, build**

Run: `npx vitest run`
Expected: all pass. The count is the 1,298 from before plus the tests this plan added.

Run: `npm run typecheck && npm run lint && npm run knip && npm run build`
Expected: typecheck clean; lint shows only the 2 existing warnings in `src/app/api/historical-events/route.test.ts`; knip clean; build succeeds.

- [ ] **Step 2: Re-run every attack from the review against production, with the public key**

```bash
set -a && source .env.local && set +a
K="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"; U="$NEXT_PUBLIC_SUPABASE_URL"
echo "engine:";  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$U/rest/v1/rpc/check_and_trigger_alerts" -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{}'
echo "push subs:"; curl -s -o /dev/null -w "%{http_code}\n" -X POST "$U/rest/v1/rpc/get_push_subscriptions_for_zone" -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{"p_zone_id":"zone-1"}'
echo "dataset:"; curl -s -o /dev/null -w "%{http_code}\n" -X POST "$U/rest/v1/rpc/get_reference_data_compact" -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{}'
echo "gps:";     curl -s -o /dev/null -w "%{http_code}\n" "$U/rest/v1/water_level_reports?select=lat,lng,reporter_id&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"
echo "public:";  curl -s -o /dev/null -w "%{http_code}\n" "$U/rest/v1/water_level_reports?select=id,zone_id,depth_level&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"
```

Expected:
- `engine` → `401` or `403` (permission denied).
- `push subs` → `404` (function gone).
- `dataset` → `404` (function gone).
- `gps` → `401` (permission denied for the columns).
- `public` → `200`.

- [ ] **Step 3: Re-run the spoofing scenario and the officials scenario against the live data, rolled back**

MCP `execute_sql`: `begin;` + SP1 fixtures block + the Task 2 engine block + `rollback;`.
Expected: no error.

- [ ] **Step 4: Advisors**

Run MCP `get_advisors` (type `security`).
Expected: the only public-schema functions in the `anon`/`authenticated` executable lists are `report_app_error`, `recent_app_error_count`, `admin_appoint_official`, `admin_remove_official` and `my_water_level_reports` (the last three for `authenticated` only). All are intended.

- [ ] **Step 5: Record the results in the ledger**

Write each command's actual output next to its Expected line in `.superpowers/sdd/2026-09-23-stop-the-bleeding/progress.md`.

---

### Task 10: Rotate the passwords and scrub the unpushed history

**Files:** none in the tree. Git history on `v1` (`origin/v1..v1`) is rewritten.

**This task needs the owner.** Stop at Step 1 until they confirm it is done.

- [ ] **Step 1: STOP — ask the owner to add three new passwords**

Ask the owner to add these to `.env.local` (git-ignored). Each must be 12+ characters, not reused, and free of `"` and `\` (Step 3 builds a JSON body from it):

```
TEST_ADMIN_PASSWORD=...
TEST_OFFICIAL_PASSWORD=...
TEST_USER_PASSWORD=...
```

Also suggest the optional free step: Supabase Dashboard → Authentication → Rate Limits → lower anonymous sign-ins per IP from 30 to about 10 per hour. Wait for their confirmation.

- [ ] **Step 2: Rotate**

```bash
set -a && source .env.local && set +a && npx tsx scripts/rotate-test-account-passwords.ts
```

Expected: `Updated admin@weatherwell.com`, `Updated official@weatherwell.com`, `Updated user@weatherwell.com`, exit code 0.

- [ ] **Step 3: Verify the old admin password no longer works, and the new one does**

```bash
set -a && source .env.local && set +a
OLD_ADMIN=$(sed -n 1p .superpowers/sdd/2026-09-23-stop-the-bleeding/old-passwords.txt)
curl -s -o /dev/null -w "old: %{http_code}\n" -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d "$(printf '{"email":"admin@weatherwell.com","password":"%s"}' "$OLD_ADMIN")"
curl -s -o /dev/null -w "new: %{http_code}\n" -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d "$(printf '{"email":"admin@weatherwell.com","password":"%s"}' "$TEST_ADMIN_PASSWORD")"
```

Expected: `old: 400`, `new: 200`.

- [ ] **Step 4: Back up, then rewrite only the unpushed commits**

```bash
git status --short
git rev-list --count origin/v1..v1
git branch "backup/pre-scrub-$(date +%Y%m%d)"
PWFILE="$(pwd)/.superpowers/sdd/2026-09-23-stop-the-bleeding/old-passwords.txt"
cat > .superpowers/sdd/2026-09-23-stop-the-bleeding/scrub.sh <<EOF
#!/bin/sh
while IFS= read -r pw; do
  escaped=\$(printf '%s' "\$pw" | sed 's/[][\\.*^\$/&]/\\\\&/g')
  grep -rlF --exclude-dir=.git -- "\$pw" . 2>/dev/null | while IFS= read -r f; do
    sed -i "s/\${escaped}/<redacted>/g" "\$f"
  done
done < "$PWFILE"
EOF
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force \
  --tree-filter "sh $(pwd)/.superpowers/sdd/2026-09-23-stop-the-bleeding/scrub.sh" \
  -- origin/v1..v1
```

Expected: `git status --short` prints nothing before the rewrite; note the commit count. `filter-branch` ends with `Ref 'refs/heads/v1' was rewritten`.

- [ ] **Step 5: Verify nothing old remains, and nothing else changed**

```bash
PWFILE=.superpowers/sdd/2026-09-23-stop-the-bleeding/old-passwords.txt
git log -p origin/v1..v1 | grep -cF -f "$PWFILE" || echo "clean: no old password in any unpushed commit"
git diff --stat "backup/pre-scrub-$(date +%Y%m%d)" v1
git rev-list --count origin/v1..v1
```

Expected:
- `clean: no old password in any unpushed commit`.
- The `diff --stat` against the backup is empty: the tip tree was already redacted in Task 1.
- The commit count equals the pre-rewrite count.

- [ ] **Step 6: STOP — report to the owner and ask before pushing**

Tell the owner:
- the passwords are rotated;
- history is scrubbed;
- the backup branch name.

Ask whether to push `v1`. After they confirm the push and that the backup is no longer needed:

```bash
git branch -D "backup/pre-scrub-$(date +%Y%m%d)"
git update-ref -d refs/original/refs/heads/v1
rm .superpowers/sdd/2026-09-23-stop-the-bleeding/old-passwords.txt .superpowers/sdd/2026-09-23-stop-the-bleeding/scrub.sh
```
