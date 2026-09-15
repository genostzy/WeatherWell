# V0 Officials and Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the planned shared PIN gate with real accounts for barangay and municipal officials, limited by the database to their area, with every official action written to an append-only record, and optional sign-in for residents.

**Architecture:** Each official's area is a prefix of the national PSGC barangay code, stored on their `profiles` row by a hand-run appointment command. One database function, `private.manages_zone(zone_id)`, replaces "is an operator" in every policy that concerns a specific barangay, so the database — not the app — enforces the area limit. Database triggers write the action record. The app gains a sign-in page, OAuth and email callbacks, an `/admin` gate that reads the verified session and profile, area-aware dashboard screens, and a history page.

**Tech Stack:** Next.js 16 (App Router, Proxy, route handlers, Server Actions), Supabase Postgres with RLS, Supabase Auth (anonymous, Google OAuth, email OTP with `@supabase/ssr` cookie sessions), React 19, Vitest + Testing Library, plain-SQL database assertions in `supabase/tests/`.

**Spec:** `docs/superpowers/specs/2026-09-11-v0-officials-and-roles-design.md` — read it before any task. It extends `docs/superpowers/specs/2026-09-05-v0-supabase-data-layer-design.md`.

**Prior plans (complete, on `origin/v0`):** Plan 1 (database), Plan 2 (read path), Plan 3 (write spine and outbox), Plan 4 (`docs/superpowers/plans/2026-09-09-v0-community-stores.md`, the four shared stores). Baseline: **564 tests / 89 files**, all five gates green.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Security**

- Never import a secret or service-role key into anything under `src/`. The publishable key plus the cookie session is the only credential.
- Server code reads identity only through `supabase.auth.getClaims()`, which verifies the JWT signature. Never authorise off `getSession()` or off `user_metadata` (the user can edit it).
- An official's role, area and display name come **only** from `public.profiles`, set by the appointment commands. Clients hold no INSERT or UPDATE grant on `profiles`; that must stay true.
- The area limit is enforced by the database. Anything the UI hides or disables is presentation only; every task's tests must still hold if a request bypasses the UI.
- `private.manages_zone` and `private.is_operator` are `language sql`, `security definer`, `set search_path = ''`. Their EXECUTE is revoked from `public` and `anon` and **granted to `authenticated`**. Never revoke EXECUTE from `authenticated`: policies call these functions while running as `authenticated`, and revoking it broke policy evaluation in Plan 1.
- No `SECURITY INVOKER` plpgsql function may reference a `private.*` name in its body. plpgsql resolves body names lazily as the invoking role, `authenticated` has no USAGE on schema `private`, and this exact shape shipped broken in Plan 3 while the test suite hid it. Trigger functions that must call `private.*` are `SECURITY DEFINER` plpgsql in `private` (they run as the owner, who has USAGE).
- Every `UPDATE` policy carries both `USING` and `WITH CHECK`. `auth.uid()` in a policy is wrapped `(select auth.uid())`. `auth.role()` appears nowhere.
- **New tables:** Supabase's default privileges grant INSERT, UPDATE and DELETE on new `public` tables to `anon` and `authenticated`. Every new table in this plan explicitly revokes the writes it does not want, even where RLS would also refuse. Plan 4 established that both layers must say no.
- Any `next` / redirect parameter accepts only a same-origin path (see `safeNext`, Task 4). No open redirects.
- **Residents sign in on their first write and nowhere else.** Every anonymous sign-in is a permanent `auth.users` row against a free-tier allowance. Nothing may call `ensureAnonymousSession()` or `signInAnonymously()` from a page load, a read, or a subscription. Optional resident sign-in (Task 8) runs only on an explicit tap.
- Residents never see officials' names and never read the action record.

**Cost**

- **Never create a Supabase branch** (`create_branch` bills per branch). No paid services.
- Delete every test user and row you create. At the end of every task: `auth.users`, `profiles`, `community_pins`, `pin_votes`, `evacuation_check_ins`, `water_level_reports`, `alerts` and `official_actions` read **0**; `zones` and `evacuation_centers` hold their 4 seed rows with their seed values (every `current_occupancy` null); no profile is an operator; any test-only fixture zone is deleted.

**Migrations**

- Iterate with `execute_sql`. When a change is settled, apply it once with `apply_migration`, read the applied version back from `list_migrations`, and name the local file in `supabase/migrations/` to match. `apply_migration` stamps its own timestamp.
- After each migration, regenerate `src/lib/supabase/database.types.ts` with `generate_typescript_types`.

**Next.js**

- This is Next.js 16 and differs from training data (see `AGENTS.md`). Before writing a layout, page, route handler, redirect or cookie code, read the relevant guide in `node_modules/next/dist/docs/`. `middleware` is renamed `proxy`; route handlers are not cached by default; `params` and `searchParams` are Promises.

**Copy**

- Every user-facing string is a `LocalizedText` (`{ en, fil }`) rendered through `t(…, lang)`, matching the existing files.

**Testing**

- Every test you add must be **proven to bite**: break the behaviour it names in the source, run that one test, confirm the **named** test fails, restore. Report what you broke and what failed.
- Database assertions go in `supabase/tests/rls.sql` using the helpers in `supabase/tests/helpers.sql`: `tests.as_user(uuid)`, `tests.as_anon()`, `tests.expect_denied(label, stmt)`, `tests.expect_allowed(label, stmt)`, `tests.expect_row_count(label, query, n)`. `tests.as_user()` only records the impersonation for the next `expect_*` call; it does **not** switch the ambient role. `expect_allowed` counts a zero-row UPDATE as a pass, so pair every allowed UPDATE with `expect_row_count`. An UPDATE refused by RLS returns zero rows and no error, so it needs `expect_row_count`, not `expect_denied`. Every denial is paired with the matching permission.
- The suite wraps itself in one transaction ending in `rollback;`. Run it with `helpers.sql`, then `reference-tables.sql`, then `rls.sql`, and confirm it reaches `rollback;` with no `TSTFL` exception.
- Gates — report each one's **exit code**, not its output text (knip has been misreported twice on this branch, in both directions):
  ```bash
  npm run lint; echo "lint: $?"
  npm run typecheck; echo "typecheck: $?"
  npx vitest run; echo "vitest: $?"
  npx knip; echo "knip: $?"
  npm run build; echo "build: $?"
  ```
- knip exits 1 on an unused export. Add each export in the task that first uses it. That includes exported types: keep a type unexported unless another file imports it.
- Do not `git add .` — `.claude-sessions/` is untracked and stays that way. Do not push. End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

**Database (created)**

| File | Responsibility |
|---|---|
| `supabase/migrations/<v>_official_areas.sql` | `profiles.area_code` / `display_name`, `municipalities`, `private.manages_zone`, the policy and trigger switches, `set_zone_alert` with `p_source`. Task 1. |
| `supabase/migrations/<v>_official_actions.sql` | `official_actions`, `private.record_official_action`, the recording triggers. Task 2. |
| `supabase/migrations/<v>_appointment_commands.sql` | `private.appoint_official`, `private.remove_official`. Task 3. |

**App (created)**

| File | Responsibility |
|---|---|
| `src/lib/auth/safe-next.ts` | `safeNext()` — turns a `next` parameter into a safe same-origin path. |
| `src/lib/auth/sign-in.ts` | Client: Google and email-link sign-in, linking to an existing anonymous identity. |
| `src/app/sign-in/page.tsx` + `src/features/auth/sign-in-panel.tsx` | The sign-in page, shared by officials and residents. |
| `src/app/auth/callback/route.ts` | OAuth code → session. |
| `src/app/auth/confirm/route.ts` | Email `token_hash` → session. |
| `src/app/auth/signout/route.ts` | POST sign-out. |
| `src/lib/auth/official.ts` | `Official` type, `areaLevel()`, `isInArea()`, `landingPathFor()` — pure, server-safe. |
| `src/lib/auth/load-official.ts` | Server-only: the caller's gate state from verified claims + profile. |
| `src/lib/auth/official-context.tsx` | Client: `OfficialProvider`, `useOfficial()`, `useManagesZone()`. |
| `src/app/admin/layout.tsx` | The `/admin` gate. |
| `src/features/admin/admin-header.tsx`, `src/features/admin/not-appointed.tsx` | Gate UI. |
| `src/features/admin/admin-overview.tsx` | Today's `/admin` page content, moved so `page.tsx` can be a server component. |
| `src/lib/official-actions-mapper.ts`, `src/lib/official-actions-copy.ts` | Row → `OfficialAction`; bilingual description of an entry. |
| `src/app/api/official-actions/route.ts` | Officials' read of the record, never cached. |
| `src/features/admin/last-change-line.tsx` | "Lowered to Yellow by Juan Dela Cruz, 2:14 AM". |
| `src/app/admin/history/page.tsx` | The history page. |
| `src/features/auth/account-link.tsx` | Residents' optional "Keep your reports on a new phone". |

**Modified:** `supabase/tests/rls.sql`, `scripts/generate-seed.ts` (+ test), `supabase/seed/seed.sql`, `src/lib/supabase/database.types.ts`, `public/sw.js`, `src/lib/service-worker.test.ts`, `src/app/admin/page.tsx`, `src/app/admin/zone/[zoneId]/page.tsx`, `src/app/admin/simulation/page.tsx`, `src/features/admin/admin-map-canvas.tsx`, `src/features/admin/evacuation-management-panel.tsx`, `src/features/admin/community-pin-moderation-panel.tsx`, `src/features/admin/flood-monitoring-panel.tsx`, `src/test-utils/render-with-data.tsx`, `src/app/layout.tsx`, `PRD.md`.

---

## Setup the system owner does

The live task (Task 11) needs these. Tasks 1–10 do not. All are free; each involves a secret or an account setting, so the system owner does them, never an agent.

1. **Google sign-in:** create an OAuth client in Google's developer console; paste its ID and secret into Supabase → Authentication → Providers → Google. Move the consent screen out of "Testing", or only listed test users can sign in.
2. **Manual linking:** switch it on in Supabase's auth settings.
3. **Redirect URLs:** allow `http://localhost:3100/**` and the V0 preview origin (`https://weatherwell-git-v0-wilsondayritjrapex-5422s-projects.vercel.app/**`).
4. **Email sending:** connect a free SMTP service. Supabase's built-in sender only reaches addresses pre-authorised in the organisation.
5. **Vercel Preview settings:** done on 2026-09-11.
6. **Email templates** *(found while planning; not in the spec's list)*: Supabase's Next.js server-side guide sends email links to a `/auth/confirm` route with a one-time `token_hash`, because a code-exchange link opened in a different browser cannot complete. In Authentication → Email Templates, set the link in **Magic Link** to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` and in **Change Email Address** to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email_change`. `RedirectTo` already carries `/auth/confirm?next=…`, which is why these start with `&`.

Steps 4 and 6 only matter for the email-link backup. Google sign-in works without them.

---

### Task 1: Areas and the area rule (database)

**Files:**
- Create: `supabase/migrations/<v>_official_areas.sql`
- Modify: `supabase/tests/rls.sql`, `scripts/generate-seed.ts`, `scripts/generate-seed.test.ts`, `supabase/seed/seed.sql`, `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `profiles.area_code text` (7 or 10 digits), `profiles.display_name text`; table `public.municipalities (code, name)`; `private.manages_zone(p_zone_id text) returns boolean`; `public.set_zone_alert(p_zone_id text, p_severity text, p_message jsonb, p_source text default 'manual')`; policy names `alerts_insert_in_area`, `alerts_update_in_area`, `centers_update_in_area`, `pins_update_own_or_in_area`, `checkins_read_own_or_in_area`, `profiles_read_own`.

- [ ] **Step 1: Give the existing test operators an area and a name**

The new constraint (Step 4) rejects an operator without both. `supabase/tests/rls.sql` creates its operators with `update public.profiles set role = 'operator' where id = …` (around lines 34 and 133). Change each to:

```sql
update public.profiles
   set role = 'operator', area_code = '0000000', display_name = 'Test Operator'
 where id = <the same id expression as before>;
```

`'0000000'` is a 7-digit prefix of both existing fixture zones' codes (`'000000000'` and `'000000001'`, which are 9 digits), so every existing assertion keeps its meaning.

Search the file for any assertion that an operator can read **another** user's profile. The new `profiles_read_own` policy removes that ability on purpose (the action record carries name snapshots, so officials do not need it). Flip such an assertion to "cannot", and say in your report which one and why.

- [ ] **Step 2: Write the failing area assertions**

Append a block to `supabase/tests/rls.sql`, before its final `rollback;`, in the file's established style. It needs three fixture barangays with real-shaped 10-digit codes — two in one town, one in another — plus a centre each, and three users. Adapt the user-creation lines to however the file already creates fixture users in `auth.users`.

```sql
-- Area limits. Town 0199901 has barangays a1 and a2; town 0199902 has b1.
insert into public.zones
  (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
values
  ('tests-area-a1', '0199901001', 'Barangay Uno, Testtown',  '{"en":"x","fil":"x"}', 14.0, 121.0, '[]', '000'),
  ('tests-area-a2', '0199901002', 'Barangay Dos, Testtown',  '{"en":"x","fil":"x"}', 14.0, 121.0, '[]', '000'),
  ('tests-area-b1', '0199902001', 'Barangay Tres, Othertown','{"en":"x","fil":"x"}', 14.0, 121.0, '[]', '000');

insert into public.evacuation_centers (id, zone_id, name, lat, lng, capacity)
values ('tests-centre-a1', 'tests-area-a1', 'C a1', 14.0, 121.0, 100),
       ('tests-centre-a2', 'tests-area-a2', 'C a2', 14.0, 121.0, 100);

-- Users (create in auth.users the same way this file already does):
--   '44444444-…-4444'  barangay official for a1  (area '0199901001')
--   '55555555-…-5555'  municipal official for Testtown (area '0199901')
--   '66666666-…-6666'  resident
update public.profiles set role='operator', area_code='0199901001', display_name='Official A1'
 where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set role='operator', area_code='0199901', display_name='Official Testtown'
 where id = '55555555-5555-5555-5555-555555555555';
```

Then the assertions, each denial paired with its permission:

| # | Caller | Statement | Expect |
|---|---|---|---|
| A1 | a1 official | `select public.set_zone_alert('tests-area-a1','red','{"en":"x","fil":"x"}'::jsonb)` | allowed, and `expect_row_count` 1 active alert in a1 |
| A2 | a1 official | the same for `tests-area-a2` (same town) | **denied** |
| A3 | Testtown official | the same for `tests-area-a2` | allowed + row count 1 |
| A4 | Testtown official | the same for `tests-area-b1` (other town) | **denied** |
| A5 | a1 official | `insert into public.alerts (zone_id, severity, message, source) values ('tests-area-a1','red','{"en":"x","fil":"x"}','auto_crowdsourced')` | **denied** |
| A6 | a1 official | the same with `'manual'` (after clearing A1's alert) | allowed |
| A7 | a1 official | clear a2's alert: `select public.set_zone_alert('tests-area-a2', null, null)` while a2 has an active alert | **denied** (42501, not a silent no-op — see Step 5) |
| A8 | a1 official | clear a1's alert | allowed, and row count 0 active alerts in a1 |
| A9 | a1 official | `update public.evacuation_centers set current_occupancy = 10 where id = 'tests-centre-a1'` | row count 1 changed |
| A10 | a1 official | the same for `'tests-centre-a2'` | row count 0 changed (RLS filters) |
| A11 | resident | insert a check-in in a2 | allowed |
| A12 | a1 official | `select * from public.evacuation_check_ins where zone_id = 'tests-area-a2'` | row count 0 |
| A13 | Testtown official | the same | row count 1 |
| A14 | a1 official | restore a removed pin in a2 | row count 0 |
| A15 | Testtown official | the same | row count 1 |
| A16 | resident | `update public.profiles set area_code = '0199901' where id = <self>`, and separately the same for `role = 'operator'` and for `display_name = 'x'` | **denied** each time (no UPDATE grant on profiles) |
| A17 | a1 official | `select * from public.profiles where id = '5555…'` | row count 0 (own row only) |
| A18 | anon | `select * from public.municipalities` | allowed |
| A19 | a1 official | `insert into public.municipalities (code, name) values ('0199903','X')` | **denied** |

For A14/A15, insert the pin as the owner with `removed = true, removed_reason = 'admin'`, then attempt `update public.community_pins set removed = false, removed_reason = null where id = <pin>` as each official.

- [ ] **Step 3: Run the suite and confirm the new assertions fail**

Run `helpers.sql`, `reference-tables.sql`, `rls.sql` through `execute_sql`. Expected: the suite stops with `TSTFL` on the first new assertion that the current `is_operator()` policies get wrong — for example A2, which an operator can do today anywhere. Record which assertion failed first.

- [ ] **Step 4: Write the migration**

Iterate with `execute_sql`, then apply once:

```sql
-- 1. An official's area and name live on their profile, set only by the
--    appointment commands (Task 3). Clients have no write grant on profiles.
alter table public.profiles
  add column area_code    text check (area_code ~ '^(\d{7}|\d{10})$'),
  add column display_name text;

alter table public.profiles
  add constraint operator_has_area_and_name
  check (role <> 'operator' or (area_code is not null and display_name is not null));

-- 2. Town names, so the appointment command accepts "Mapandan" not a code.
create table public.municipalities (
  code text primary key check (code ~ '^\d{7}$'),
  name text not null
);
alter table public.municipalities enable row level security;
revoke insert, update, delete, truncate on public.municipalities from anon, authenticated;
grant select on public.municipalities to anon, authenticated;
create policy municipalities_read on public.municipalities
  for select to anon, authenticated using (true);

-- 3. The one rule. `language sql`, never plpgsql (see Global Constraints).
--    area_code is digits only (the check above), so LIKE sees no wildcards.
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
      and p.role = 'operator'
      and z.psgc_barangay_code like p.area_code || '%'
  );
$$;
revoke execute on function private.manages_zone(text) from public, anon;
grant  execute on function private.manages_zone(text) to authenticated;

-- 4. Every policy that authorises an action on a specific barangay.
--    manages_zone takes a row value, so it is called directly rather than
--    wrapped in (select …): the wrapper only helps functions that do not
--    depend on the row.
drop policy alerts_write_operator on public.alerts;
create policy alerts_insert_in_area on public.alerts
  for insert to authenticated
  with check (private.manages_zone(zone_id) and source = 'manual');

drop policy alerts_update_operator on public.alerts;
create policy alerts_update_in_area on public.alerts
  for update to authenticated
  using (private.manages_zone(zone_id))
  with check (private.manages_zone(zone_id));

drop policy centers_update_operator on public.evacuation_centers;
create policy centers_update_in_area on public.evacuation_centers
  for update to authenticated
  using (private.manages_zone(zone_id))
  with check (private.manages_zone(zone_id));

drop policy pins_update_own_or_operator on public.community_pins;
create policy pins_update_own_or_in_area on public.community_pins
  for update to authenticated
  using ((select auth.uid()) = author_id or private.manages_zone(zone_id))
  with check ((select auth.uid()) = author_id or private.manages_zone(zone_id));

drop policy checkins_read_own_or_operator on public.evacuation_check_ins;
create policy checkins_read_own_or_in_area on public.evacuation_check_ins
  for select to authenticated
  using ((select auth.uid()) = user_id or private.manages_zone(zone_id));

drop policy profiles_read_own_or_operator on public.profiles;
create policy profiles_read_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- 5. Only an official for THIS barangay may restore a pin or set its reason.
drop trigger pins_protect_moderation_columns on public.community_pins;
create trigger pins_protect_moderation_columns
  before update on public.community_pins
  for each row
  when (
    row_security_active('public.community_pins')
    and not private.manages_zone(new.zone_id)
    and ((old.removed and not new.removed)
         or (new.removed_reason is distinct from old.removed_reason))
  )
  execute function private.deny_pin_moderation_write();

create or replace function private.deny_pin_moderation_write()
  returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501',
    message = 'only an official for this barangay may restore a removed pin or set removed_reason';
end $$;

-- 6. One alert path for people and machines (spec: Built for V1).
--    Officials reach it through RLS, which pins their rows to 'manual'.
--    V1's engine calls it with the service role and its own source.
drop function public.set_zone_alert(text, text, jsonb);
create function public.set_zone_alert(
  p_zone_id  text,
  p_severity text,
  p_message  jsonb,
  p_source   text default 'manual'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous text;
begin
  update public.alerts
     set is_active = false, superseded_at = now()
   where zone_id = p_zone_id and is_active
  returning severity into v_previous;

  -- A clear by someone RLS filters out would otherwise be a silent no-op
  -- the caller reads as success. Alerts are world-readable, so the invoker
  -- can see that an active alert exists even when it may not change it.
  if p_severity is null and v_previous is null
     and exists (select 1 from public.alerts where zone_id = p_zone_id and is_active) then
    raise exception using errcode = '42501',
      message = 'not an official for this barangay';
  end if;

  if p_severity is not null then
    insert into public.alerts
      (zone_id, severity, message, source, confidence, superseded_severity)
    values
      (p_zone_id, p_severity, p_message, p_source,
       case when p_source = 'manual' then 'validated' else 'estimated' end,
       v_previous);
  end if;
end;
$$;
revoke execute on function public.set_zone_alert(text, text, jsonb, text) from public, anon;
grant  execute on function public.set_zone_alert(text, text, jsonb, text) to authenticated, service_role;
```

`set_zone_alert`'s body references only `public.*` names, so being `SECURITY INVOKER` plpgsql is safe (see Global Constraints).

- [ ] **Step 5: Seed the towns**

In `scripts/generate-seed.ts`, emit one `municipalities` row per distinct town in the mock zones, deriving the 7-digit code from each zone's `psgcBarangayCode` and the town name from the text after the last `", "` in its name:

```ts
export function municipalitiesFrom(zones: { psgcBarangayCode: string; name: string }[]): { code: string; name: string }[] {
  const byCode = new Map<string, string>();
  for (const zone of zones) {
    const code = zone.psgcBarangayCode.slice(0, 7);
    const town = zone.name.slice(zone.name.lastIndexOf(", ") + 2).trim();
    if (!byCode.has(code)) byCode.set(code, town);
  }
  return [...byCode].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
}
```

Emit `insert into public.municipalities (code, name) values (…) on conflict (code) do nothing;` in `buildSeedSql()`. Test it in `scripts/generate-seed.test.ts`: four mock zones in four towns produce four rows whose codes are the first seven digits. Regenerate `supabase/seed/seed.sql`, and run just its `municipalities` inserts against the live project.

- [ ] **Step 6: Run the suite and confirm it passes**

Expected: reaches `rollback;` with no `TSTFL`.

- [ ] **Step 7: Prove the key assertions bite**

For each, reverse the protection **in the live database**, run the suite, confirm the named assertion fails, restore it, and re-read the definition to confirm it matches the migration byte for byte. **Record each definition before you change it.** Reverse one at a time.

- A2: recreate `alerts_insert_in_area` with `private.is_operator()` in place of `manages_zone(zone_id)`.
- A5: drop `and source = 'manual'` from the same policy.
- A7: remove the new `raise` block from `set_zone_alert`.
- A12: recreate `checkins_read_own_or_in_area` with `is_operator()`.

- [ ] **Step 8: Regenerate types, run the gates, clean up, commit**

Regenerate `database.types.ts`. `src/app/actions/set-zone-alert.ts` needs no change (`p_source` has a default). Run all five gates. Confirm the end-of-task database state from Global Constraints.

```bash
git add supabase/migrations supabase/tests/rls.sql scripts/generate-seed.ts scripts/generate-seed.test.ts supabase/seed/seed.sql src/lib/supabase/database.types.ts
git commit -m "feat(rls): limit every official to their own area"
```

---

### Task 2: The action record (database)

**Files:**
- Create: `supabase/migrations/<v>_official_actions.sql`
- Modify: `supabase/tests/rls.sql`, `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: `private.manages_zone`, `profiles.display_name` / `area_code` (Task 1).
- Produces: table `public.official_actions (id, occurred_at, actor_id, actor_name, actor_area, action, zone_id, target_id, detail)`; `private.record_official_action(p_action text, p_zone_id text, p_target_id text, p_detail jsonb, p_actor_override text default null)`.

- [ ] **Step 1: Write the failing assertions**

Append to `rls.sql`, reusing Task 1's fixture zones and officials.

**Deferred triggers do not fire inside the suite unless you force them.** `alert.cleared` is recorded by a `DEFERRABLE INITIALLY DEFERRED` trigger, which fires at COMMIT — and the suite never commits, it rolls back. After each statement whose deferred effect you want to observe, run `set constraints all immediate;` then `set constraints all deferred;`. Without this, the `alert.cleared` assertions pass vacuously.

| # | Action | Expect |
|---|---|---|
| R1 | a1 official sets a1 to `red` | exactly one row where `action='alert.set' and zone_id='tests-area-a1'`, `detail->>'from'` null, `detail->>'to'` `'red'`, `actor_name='Official A1'`, `actor_area='0199901001'` |
| R2 | a1 official lowers a1 to `yellow`, then `set constraints all immediate` | exactly **one** new `alert.set` row (`from` red, `to` yellow) and **no** `alert.cleared` row |
| R3 | a1 official clears a1, then `set constraints all immediate` | exactly one `alert.cleared` row with `detail->>'from' = 'yellow'` |
| R4 | a1 official changes `tests-centre-a1` status | one `centre.status` row with from/to |
| R5 | a1 official changes its occupancy | one `centre.occupancy` row |
| R6 | a1 official removes a pin in a1 (`removed=true, removed_reason='admin'`) | one `pin.removed` row, `detail->>'reason' = 'admin'`, actor `Official A1` |
| R7 | the pin's author withdraws their own pin (`removed=true`, reason null) | **no** row |
| R8 | a net-score removal (reuse the file's existing 5-downvote fixture) | one `pin.removed` row with `actor_name = 'Automatic — net score'` and `actor_id` null — not the voter |
| R9 | as the owner — reset the role **and** clear the JWT claims first (`select set_config('request.jwt.claims', '', true)`), or `auth.uid()` still returns the last impersonated user and the row is credited to them — `select public.set_zone_alert('tests-area-a2','orange','{"en":"x","fil":"x"}'::jsonb,'auto_crowdsourced')` | one `alert.set` row with `actor_name = 'Automatic — auto_crowdsourced'` |
| R10 | a1 official: `insert into public.official_actions (actor_name, action) values ('x','alert.set')` | **denied** |
| R11 | a1 official: `update public.official_actions set actor_name = 'x'` | **denied** — there is no UPDATE grant, so it raises rather than filtering |
| R12 | a1 official: `delete from public.official_actions` | **denied** |
| R13 | resident: `select * from public.official_actions` | row count 0 |
| R14 | Testtown official: `select * from public.official_actions` | row count ≥ 1, including a1's entries (every official reads every area) |

- [ ] **Step 2: Run the suite and confirm the new assertions fail**

Expected: `relation "public.official_actions" does not exist` at R1.

- [ ] **Step 3: Write the migration**

```sql
create table public.official_actions (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text not null,
  actor_area  text,
  action      text not null check (action in (
                'alert.set','alert.cleared','centre.status','centre.occupancy',
                'pin.removed','pin.restored','official.appointed','official.removed')),
  zone_id     text references public.zones (id),
  target_id   text,
  detail      jsonb not null default '{}'
);
create index official_actions_zone_time on public.official_actions (zone_id, occurred_at desc);
create index official_actions_time      on public.official_actions (occurred_at desc);

alter table public.official_actions enable row level security;
revoke insert, update, delete, truncate on public.official_actions from anon, authenticated;
grant select on public.official_actions to authenticated;
create policy official_actions_read on public.official_actions
  for select to authenticated
  using ((select private.is_operator()));

-- The only writer. Snapshots the actor's name and area at this moment, so
-- history survives a later rename or removal.
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
      from public.profiles where id = v_uid and role = 'operator';
    -- Should be unreachable: RLS lets only officials make these changes.
    -- Recorded honestly rather than silently dropped if it ever happens.
    if v_name is null then v_name := 'Not an official'; end if;
  end if;

  insert into public.official_actions
    (actor_id, actor_name, actor_area, action, zone_id, target_id, detail)
  values
    (v_uid, v_name, v_area, p_action, p_zone_id, p_target_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke execute on function private.record_official_action(text, text, text, jsonb, text)
  from public, anon, authenticated;

-- alert.set: one entry per inserted alert, carrying what it replaced.
create or replace function private.record_alert_set()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.record_official_action(
    'alert.set', new.zone_id, new.id::text,
    jsonb_build_object('from', new.superseded_severity, 'to', new.severity, 'source', new.source),
    case when (select auth.uid()) is null and new.source <> 'manual'
         then 'Automatic — ' || new.source end);
  return null;
end $$;
create trigger alerts_record_set
  after insert on public.alerts
  for each row execute function private.record_alert_set();

-- alert.cleared: only when the zone ENDS the transaction with no active
-- alert. set_zone_alert deactivates then inserts; recording the deactivation
-- directly would double every change.
create or replace function private.record_alert_cleared()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.alerts where zone_id = new.zone_id and is_active) then
    perform private.record_official_action(
      'alert.cleared', new.zone_id, new.id::text,
      jsonb_build_object('from', old.severity), null);
  end if;
  return null;
end $$;
create constraint trigger alerts_record_cleared
  after update of is_active on public.alerts
  deferrable initially deferred
  for each row
  when (old.is_active and not new.is_active)
  execute function private.record_alert_cleared();

create or replace function private.record_centre_change()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform private.record_official_action('centre.status', new.zone_id, new.id,
      jsonb_build_object('from', old.status, 'to', new.status), null);
  end if;
  if new.current_occupancy is distinct from old.current_occupancy then
    perform private.record_official_action('centre.occupancy', new.zone_id, new.id,
      jsonb_build_object('from', old.current_occupancy, 'to', new.current_occupancy), null);
  end if;
  return null;
end $$;
create trigger centres_record_change
  after update of status, current_occupancy on public.evacuation_centers
  for each row execute function private.record_centre_change();

create or replace function private.record_pin_moderation()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not old.removed and new.removed then
    if new.removed_reason = 'net_score' then
      perform private.record_official_action('pin.removed', new.zone_id, new.id::text,
        jsonb_build_object('reason', 'net_score'), 'Automatic — net score');
    elsif new.removed_reason = 'admin' then
      perform private.record_official_action('pin.removed', new.zone_id, new.id::text,
        jsonb_build_object('reason', 'admin'), null);
    end if;
    -- removed_reason null: the author withdrew their own pin. Not an official action.
  elsif old.removed and not new.removed then
    perform private.record_official_action('pin.restored', new.zone_id, new.id::text,
      '{}'::jsonb, null);
  end if;
  return null;
end $$;
create trigger pins_record_moderation
  after update of removed on public.community_pins
  for each row execute function private.record_pin_moderation();
```

`auth.uid()` reads a per-transaction setting, not the role, so it still returns the caller inside these `SECURITY DEFINER` functions, including in the deferred trigger (which runs before commit, inside the same transaction).

- [ ] **Step 4: Run the suite and confirm it passes**

- [ ] **Step 5: Prove the key assertions bite** — reverse, run, confirm the named assertion fails, restore and byte-compare, one at a time:

- R2: replace the deferred clear trigger with a plain `after update` trigger that records unconditionally.
- R3: drop the `set constraints all immediate` from the R3 block — confirm the assertion fails (this proves the test needs it). Restore.
- R8: remove the `net_score` branch so the removal records the voter.
- R13: change `official_actions_read` to `using (true)`.

- [ ] **Step 6: Regenerate types, gates, clean up (delete every `official_actions` row created while iterating — the owner can), commit**

```bash
git add supabase/migrations supabase/tests/rls.sql src/lib/supabase/database.types.ts
git commit -m "feat(rls): record every official action in an append-only log"
```

---

### Task 3: Appointment commands (database)

**Files:**
- Create: `supabase/migrations/<v>_appointment_commands.sql`
- Modify: `supabase/tests/rls.sql`

**Interfaces:**
- Consumes: `municipalities`, `profiles.area_code` / `display_name` (Task 1); `private.record_official_action` (Task 2).
- Produces: `private.appoint_official(p_email text, p_area text, p_display_name text) returns text`; `private.remove_official(p_email text) returns text`. Owner-only.

- [ ] **Step 1: Write the failing assertions**

In `rls.sql`, as the owner (ambient role reset), with a fixture `auth.users` row that has an email (`'official.test@example.com'`, `is_anonymous = false`) and one anonymous fixture user:

| # | Call | Expect |
|---|---|---|
| P1 | `private.appoint_official('official.test@example.com', 'Uno, Testtown', 'Test Official')` | returns text containing `covers 1 barangay`; the profile is `operator` with `area_code = '0199901001'` |
| P2 | `private.appoint_official('official.test@example.com', 'Testtown', 'Test Official')` | returns text containing `covers 2 barangay`; `area_code = '0199901'` |
| P3 | an email with no account | raises, message contains `sign in once first` |
| P4 | an ambiguous town name (insert a second `municipalities` row with the same name) | raises, message lists both codes |
| P5 | the 7-digit code `'0199902'` as the area | accepted (the documented escape hatch for ambiguous names) |
| P6 | `private.remove_official('official.test@example.com')` | the profile is `resident` with null area and name |
| P7 | P1, P2 and P6 each wrote one `official_actions` row with `actor_name = 'System owner'` | yes |
| P8 | as `authenticated`: `select private.appoint_official('x@example.com','Testtown','X')` | **denied** |
| P9 | after P6, impersonate the removed user: `select public.set_zone_alert('tests-area-a1','red','{"en":"x","fil":"x"}'::jsonb)` | **denied** — removal takes effect on the very next statement |

- [ ] **Step 2: Confirm they fail** (the functions do not exist).

- [ ] **Step 3: Write the migration**

```sql
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

  if v_area ~ '^(\d{7}|\d{10})$' then
    -- Escape hatch for names that are ambiguous. The echo below shows what it covers.
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

  select count(*), string_agg(name, '; ' order by name)
    into v_count, v_covered
    from public.zones where psgc_barangay_code like v_code || '%';

  perform private.record_official_action('official.appointed', null, v_user::text,
    jsonb_build_object('area', v_code, 'area_name', v_label, 'display_name', v_name),
    'System owner');

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
    jsonb_build_object('area', v_area, 'display_name', v_name), 'System owner');

  return format('%s is no longer an official (was %s).', v_name, v_area);
end;
$$;

revoke execute on function private.appoint_official(text, text, text) from public, anon, authenticated, service_role;
revoke execute on function private.remove_official(text)             from public, anon, authenticated, service_role;
```

- [ ] **Step 4: Run the suite, prove P1, P8 and P9 bite** (P1: change the echo to omit the count; P8: grant EXECUTE to `authenticated` — record and restore the grant; P9: make `remove_official` skip its profile update).

- [ ] **Step 5: Gates, clean up, commit**

```bash
git add supabase/migrations supabase/tests/rls.sql
git commit -m "feat(rls): appoint and remove officials by name, from the SQL editor only"
```

---

### Task 4: Sign-in, callbacks and sign-out

**Files:**
- Create: `src/lib/auth/safe-next.ts` (+ `.test.ts`), `src/lib/auth/sign-in.ts` (+ `.test.ts`), `src/app/sign-in/page.tsx`, `src/features/auth/sign-in-panel.tsx` (+ `.test.tsx`), `src/app/auth/callback/route.ts` (+ `.test.ts`), `src/app/auth/confirm/route.ts` (+ `.test.ts`), `src/app/auth/signout/route.ts` (+ `.test.ts`)
- Modify: `public/sw.js`, `src/lib/service-worker.test.ts`

**Interfaces:**
- Consumes: `getBrowserClient()` (`src/lib/supabase/browser.ts`), `createSupabaseUserClient()` (`src/lib/supabase/user-server.ts`).
- Produces: `safeNext(raw: string | null | undefined, fallback?: string): string`; `startGoogleSignIn(next: string, opts?: { link?: boolean }): Promise<SignInResult>`; `sendEmailSignInLink(email: string, next: string): Promise<SignInResult>`; `type SignInResult = { ok: true } | { ok: false; error: string }`; routes `/sign-in`, `/auth/callback`, `/auth/confirm`, `POST /auth/signout`.

- [ ] **Step 1: `safeNext` — test first**

```ts
// src/lib/auth/safe-next.test.ts
import { describe, it, expect } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps a same-origin path", () => {
    expect(safeNext("/admin/zone/zone-1?x=1")).toBe("/admin/zone/zone-1?x=1");
  });
  it("refuses another origin, a protocol-relative URL and backslash tricks", () => {
    expect(safeNext("https://evil.example/admin")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
  });
  it("falls back when missing", () => {
    expect(safeNext(null, "/admin")).toBe("/admin");
  });
});
```

```ts
// src/lib/auth/safe-next.ts
/**
 * A redirect target from a query string, reduced to a same-origin path.
 * Anything else — another origin, "//host", a backslash the browser would
 * normalise into one — becomes the fallback. Without this, a sign-in link
 * could forward a freshly signed-in official to a lookalike site.
 */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}
```

- [ ] **Step 2: The sign-in module — test first**

Mock `@/lib/supabase/browser` so `getBrowserClient()` returns a fake with `auth.getSession`, `auth.linkIdentity`, `auth.signInWithOAuth`, `auth.updateUser`, `auth.signInWithOtp` as `vi.fn()`. Tests:

- With an anonymous session, `startGoogleSignIn("/admin")` calls `linkIdentity({ provider: "google", options: { redirectTo } })` where `redirectTo` is `${origin}/auth/callback?next=%2Fadmin`, and does **not** call `signInWithOAuth`.
- With no session, it calls `signInWithOAuth` and not `linkIdentity`.
- With `{ link: false }` and an anonymous session, it calls `signInWithOAuth`.
- `startGoogleSignIn("https://evil.example")` puts `next=%2F` in `redirectTo`.
- With an anonymous session, `sendEmailSignInLink(email, "/admin")` calls `updateUser({ email }, { emailRedirectTo })` with `emailRedirectTo = ${origin}/auth/confirm?next=%2Fadmin`; if that returns an error, it falls back to `signInWithOtp`.
- With no session, it calls `signInWithOtp({ email, options: { emailRedirectTo, shouldCreateUser: true } })`.
- **Sign-in rule:** none of these functions calls `signInAnonymously`.

```ts
// src/lib/auth/sign-in.ts
"use client";

import { getBrowserClient } from "@/lib/supabase/browser";
import { safeNext } from "./safe-next";

export type SignInResult = { ok: true } | { ok: false; error: string };

function returnUrl(route: "/auth/callback" | "/auth/confirm", next: string): string {
  const url = new URL(route, window.location.origin);
  url.searchParams.set("next", safeNext(next));
  return url.toString();
}

/**
 * Google sign-in. When this phone already carries an anonymous resident
 * session, the Google identity is LINKED to it (manual linking must be on in
 * Supabase), so the user id — and every report and pin filed under it — is
 * kept. `link: false` is the fallback the sign-in page offers when linking
 * failed because that Google account already belongs to another user.
 */
export async function startGoogleSignIn(next: string, opts: { link?: boolean } = {}): Promise<SignInResult> {
  const supabase = getBrowserClient();
  const redirectTo = returnUrl("/auth/callback", next);
  const { data } = await supabase.auth.getSession();

  if ((opts.link ?? true) && data.session?.user.is_anonymous) {
    const { error } = await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo } });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** The email-link backup, with the same linking rule. */
export async function sendEmailSignInLink(email: string, next: string): Promise<SignInResult> {
  const supabase = getBrowserClient();
  const emailRedirectTo = returnUrl("/auth/confirm", next);
  const { data } = await supabase.auth.getSession();

  if (data.session?.user.is_anonymous) {
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo });
    if (!error) return { ok: true };
    // Most likely the email already belongs to another account. Sign into
    // that one instead; this phone's anonymous history stays where it is.
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo, shouldCreateUser: true },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
```

- [ ] **Step 3: The three routes — tests first**

Mock `@/lib/supabase/user-server`. Build `NextRequest`s directly.

`/auth/callback`: with `?code=abc&next=/admin` and `exchangeCodeForSession` succeeding → 307/302 to `/admin`; with an `error` parameter or a failing exchange → redirect to `/sign-in?next=%2Fadmin&notice=failed`; `next=https://evil.example` → redirect to `/`; every response carries `Cache-Control: no-store`.

`/auth/confirm`: `?token_hash=t&type=email&next=/admin` with `verifyOtp({ type: "email", token_hash: "t" })` succeeding → redirect to `/admin`; `type=email_change` accepted; any other `type` → `/sign-in?…&notice=failed` without calling `verifyOtp`.

`/auth/signout` (POST): calls `getClaims()`, then `signOut()` only if claims exist; redirects (303) to the form's `next` via `safeNext`, default `/`.

```ts
// src/app/auth/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { safeNext } from "@/lib/auth/safe-next";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Where Google sends an official (or a resident linking an account) back to.
 * Exchanges the one-time code for a session cookie. Any failure — including a
 * Google account that already belongs to another user, which makes linking
 * fail — returns to /sign-in, which then offers "Sign in to my existing
 * account". The page handles every failure the same way, so this route never
 * depends on the exact error code Supabase uses.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");

  if (code && !url.searchParams.get("error")) {
    const supabase = await createSupabaseUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin), { headers: NO_STORE });
  }

  const back = new URL("/sign-in", url.origin);
  back.searchParams.set("next", next);
  back.searchParams.set("notice", "failed");
  return NextResponse.redirect(back, { headers: NO_STORE });
}
```

```ts
// src/app/auth/confirm/route.ts
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { safeNext } from "@/lib/auth/safe-next";

const NO_STORE = { "Cache-Control": "no-store" };
const ALLOWED: EmailOtpType[] = ["email", "email_change"];

/**
 * Where an email sign-in link lands. Uses the link's one-time token_hash
 * (Supabase's recommended server-side pattern) rather than a code exchange,
 * which cannot complete when the link opens in a different browser from the
 * one that asked for it. Needs setup step 6 (email templates).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type && ALLOWED.includes(type)) {
    const supabase = await createSupabaseUserClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin), { headers: NO_STORE });
  }

  const back = new URL("/sign-in", url.origin);
  back.searchParams.set("next", next);
  back.searchParams.set("notice", "failed");
  return NextResponse.redirect(back, { headers: NO_STORE });
}
```

```ts
// src/app/auth/signout/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { safeNext } from "@/lib/auth/safe-next";

/** POST so a stray link or prefetch can never sign someone out. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = safeNext(typeof form.get("next") === "string" ? (form.get("next") as string) : null);
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) await supabase.auth.signOut();
  return NextResponse.redirect(new URL(next, request.url), { status: 303, headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 4: The sign-in page and panel — tests first**

`src/app/sign-in/page.tsx` is a server component: `await searchParams`, read `next` (through `safeNext`) and `notice`, render `<SignInPanel next={next} notice={notice} />`.

`SignInPanel` (client) renders, all in both languages:
- A heading chosen by `next`: starts with `/admin` → "Sign in as an official"; otherwise → "Keep your reports on a new phone".
- A line under the official heading: "Signing in does not make you an official. The system owner appoints officials."
- **Continue with Google** → `startGoogleSignIn(next)`.
- An email field and **Email me a sign-in link** → `sendEmailSignInLink(email, next)`, then "Check your email for a sign-in link."
- When `notice === "failed"`: "That didn't work. If this Google account is already used on another phone, sign in to that account instead." and a **Sign in to my existing account** button → `startGoogleSignIn(next, { link: false })`.
- A result `{ ok: false }` shows its error next to the control that produced it.

Tests (mock `@/lib/auth/sign-in`): each button calls the right function with `next`; the failure notice shows the existing-account button, which passes `{ link: false }`; the official heading appears only for `/admin…`; nothing calls `signInAnonymously` on mount.

- [ ] **Step 5: Service worker — test first**

In `src/lib/service-worker.test.ts` (which evaluates the real `public/sw.js` in a sandbox and parses `VERSION` from its source — build cache names from that, never hardcode):

- A navigation to `/auth/callback?code=x` is **never written** to any cache.
- A navigation to `/auth/callback?code=x` is **not answered from cache** even when `SHELL_CACHE` holds a seeded response for that URL. Seed the cache the navigation branch actually reads, and prove the test is not vacuous by temporarily deleting the new branch and watching it fail.
- The same two for `/sign-in`.
- The install handler no longer adds `/admin`, `/admin/map` or `/admin/simulation` to `SHELL_CACHE`.

Then change `public/sw.js`:

1. Remove `"/admin"`, `"/admin/map"`, `"/admin/simulation"` from `PRECACHED_ROUTES`, with a comment: once `/admin` needs a sign-in, pre-downloading it would save the sign-in page on every device and serve it back in place of the dashboard; an official's own visits are still cached by the network-first navigation branch.
2. Directly after the method/origin checks in the `fetch` handler:

```js
  // Sign-in and its callbacks carry one-time codes and set the session.
  // Never stored, and never answered from a store.
  if (url.pathname === "/sign-in" || url.pathname.startsWith("/auth/")) {
    event.respondWith(fetch(request));
    return;
  }
```

3. Bump `VERSION` (`v8` → `v9`).

- [ ] **Step 6: Prove the tests bite, run the gates, commit**

At minimum: `safeNext` (drop the `//` check), the linking choice (always call `signInWithOAuth`), the confirm-route type allowlist (remove the check), the signout-only-if-claims rule, and both new service-worker branches.

```bash
git add src/lib/auth src/app/sign-in src/features/auth src/app/auth public/sw.js src/lib/service-worker.test.ts
git commit -m "feat(auth): sign in with Google or an email link, keeping an anonymous resident's history"
```

---

### Task 5: The `/admin` gate and header

**Files:**
- Create: `src/lib/auth/official.ts` (+ `.test.ts`), `src/lib/auth/load-official.ts` (+ `.test.ts`), `src/lib/auth/official-context.tsx` (+ `.test.tsx`), `src/app/admin/layout.tsx`, `src/features/admin/admin-header.tsx` (+ `.test.tsx`), `src/features/admin/not-appointed.tsx` (+ `.test.tsx`)
- Modify: `src/test-utils/render-with-data.tsx`

**Interfaces:**
- Consumes: `createSupabaseUserClient()`, `createSupabaseServerClient()` (`src/lib/supabase/server.ts`), `safeNext` (Task 4).
- Produces:
  - `interface Official { userId: string; displayName: string; areaCode: string; areaName: string; level: "barangay" | "municipality" }`
  - `areaLevel(areaCode: string): "barangay" | "municipality"`
  - `type GateState = { state: "signed-out" } | { state: "not-appointed"; email: string | null } | { state: "official"; official: Official }` (not exported — callers use `loadOfficial`'s inferred return type)
  - `loadOfficial(): Promise<GateState>` (server-only, wrapped in React `cache`)
  - `OfficialProvider`, `useOfficial(): Official`
  - `renderWithData(ui, { official? })`

- [ ] **Step 1: `official.ts` — test first**

```ts
// src/lib/auth/official.ts
/** An appointed official, as the dashboard sees them. Built only from the verified session and their profile row. */
export interface Official {
  userId: string;
  displayName: string;
  /** A PSGC prefix: 10 digits for one barangay, 7 for a whole town. */
  areaCode: string;
  areaName: string;
  level: "barangay" | "municipality";
}

export function areaLevel(areaCode: string): "barangay" | "municipality" {
  return areaCode.length === 10 ? "barangay" : "municipality";
}
```

Test: a 10-digit code is `"barangay"`, a 7-digit code is `"municipality"`.

- [ ] **Step 2: `loadOfficial` — test first**

Mock `@/lib/supabase/user-server` and `@/lib/supabase/server`. Tests:
- No claims → `{ state: "signed-out" }`.
- Claims, profile `role = 'resident'` → `{ state: "not-appointed", email }` where `email` is `claims.email` or `null` for an anonymous session.
- Claims, profile `operator` with a 10-digit area → `official` whose `areaName` is the matching zone's name and `level` is `"barangay"`.
- A 7-digit area → `areaName` from `municipalities`, `level` `"municipality"`.
- The profile query is `select("role, area_code, display_name").eq("id", claims.sub)` — the caller's own row, the only one `profiles_read_own` allows.

```ts
// src/lib/auth/load-official.ts
import "server-only";
import { cache } from "react";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { areaLevel, type Official } from "./official";

type GateState =
  | { state: "signed-out" }
  | { state: "not-appointed"; email: string | null }
  | { state: "official"; official: Official };

/**
 * Who is asking, from the VERIFIED session (getClaims, never getSession) and
 * their own profile row. Cached per request, so the layout and the page share
 * one lookup. This decides what the dashboard shows; the database still
 * refuses anything outside the official's area however a request arrives.
 */
export const loadOfficial = cache(async (): Promise<GateState> => {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { state: "signed-out" };

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
});
```

- [ ] **Step 3: Context, header, not-appointed — tests first**

```tsx
// src/lib/auth/official-context.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Official } from "./official";

export const OfficialContext = createContext<Official | null>(null);

export function OfficialProvider({ official, children }: { official: Official; children: ReactNode }) {
  return <OfficialContext.Provider value={official}>{children}</OfficialContext.Provider>;
}

/** The signed-in official. Only mounted inside the /admin gate; in tests use renderWithData. */
export function useOfficial(): Official {
  const official = useContext(OfficialContext);
  if (!official) {
    throw new Error("useOfficial requires the /admin layout's OfficialProvider. In tests, use renderWithData.");
  }
  return official;
}
```

`AdminHeader` (client) shows `displayName — areaName` and a **Sign out** `<form method="post" action="/auth/signout">` with a hidden `next` of `/`. `NotAppointed` shows, in both languages: "You're signed in, but you haven't been appointed as an official yet. Send this email address to the system owner: {email}". When `email` is null (an anonymous session), it shows "Sign in with your own account first" and a link to `/sign-in?next=/admin`.

Tests: `useOfficial` throws outside a provider; the header shows name and area and posts to `/auth/signout`; `NotAppointed` shows the email, or the sign-in link when it is null.

- [ ] **Step 4: The layout**

```tsx
// src/app/admin/layout.tsx
import { redirect } from "next/navigation";
import { loadOfficial } from "@/lib/auth/load-official";
import { OfficialProvider } from "@/lib/auth/official-context";
import { AdminHeader } from "@/features/admin/admin-header";
import { NotAppointed } from "@/features/admin/not-appointed";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const gate = await loadOfficial();
  if (gate.state === "signed-out") redirect("/sign-in?next=/admin");
  if (gate.state === "not-appointed") return <NotAppointed email={gate.email} />;
  return (
    <OfficialProvider official={gate.official}>
      <AdminHeader />
      {children}
    </OfficialProvider>
  );
}
```

- [ ] **Step 5: `renderWithData` gains an official**

Add `official?: Official | null` to its options and wrap the tree in `OfficialContext.Provider`. Default:

```ts
/**
 * Test-only: an empty areaCode is a prefix of every fixture code, so existing
 * admin tests keep every control. Production can never produce this — the
 * database's area_code check requires 7 or 10 digits. New tests pass a real
 * area to exercise the limits.
 */
const TEST_OFFICIAL: Official = {
  userId: "test-official",
  displayName: "Test Official",
  areaCode: "",
  areaName: "All test zones",
  level: "municipality",
};
```

- [ ] **Step 6: Prove the tests bite, run the full suite, gates, commit**

At minimum: `loadOfficial`'s operator check (accept any role), the anonymous → `email: null` path, and `useOfficial`'s throw.

```bash
git add src/lib/auth src/app/admin/layout.tsx src/features/admin/admin-header.tsx src/features/admin/not-appointed.tsx src/test-utils/render-with-data.tsx
git commit -m "feat(admin): gate the dashboard on a signed-in, appointed official"
```

---

### Task 6: Dashboard scoping

**Files:**
- Create: `src/features/admin/admin-overview.tsx` (today's `/admin` content, moved)
- Modify: `src/lib/auth/official.ts` (+ test), `src/lib/auth/official-context.tsx`, `src/app/admin/page.tsx`, `src/app/admin/zone/[zoneId]/page.tsx`, `src/app/admin/simulation/page.tsx`, `src/features/admin/admin-map-canvas.tsx`, `src/features/admin/evacuation-management-panel.tsx`, `src/features/admin/community-pin-moderation-panel.tsx`, `src/features/admin/flood-monitoring-panel.tsx`, and their tests

**Interfaces:**
- Consumes: `Official`, `useOfficial()`, `loadOfficial()` (Task 5).
- Produces: `isInArea(psgcBarangayCode: string, areaCode: string): boolean`; `landingPathFor(official: Official, zones: { id: string; psgcBarangayCode: string }[]): string | null`; `useManagesZone(): (zone: { psgcBarangayCode: string }) => boolean`.

- [ ] **Step 1: The pure helpers — test first**

```ts
// added to src/lib/auth/official.ts
export function isInArea(psgcBarangayCode: string, areaCode: string): boolean {
  return psgcBarangayCode.startsWith(areaCode);
}

/** A barangay official goes straight to their barangay; a municipal official gets the overview. */
export function landingPathFor(
  official: Official,
  zones: { id: string; psgcBarangayCode: string }[]
): string | null {
  if (official.level !== "barangay") return null;
  const own = zones.find((zone) => zone.psgcBarangayCode === official.areaCode);
  return own ? `/admin/zone/${own.id}` : null;
}
```

Tests: `isInArea` true for a town prefix, false for another town; `landingPathFor` returns the zone path for a 10-digit area, `null` for a 7-digit area, and `null` when no zone matches.

```tsx
// added to src/lib/auth/official-context.tsx
import { isInArea } from "./official";

/** Presentation only: whether to show this barangay's controls. The database decides. */
export function useManagesZone(): (zone: { psgcBarangayCode: string }) => boolean {
  const official = useOfficial();
  return (zone) => isInArea(zone.psgcBarangayCode, official.areaCode);
}
```

- [ ] **Step 2: `/admin` becomes a server page**

Move the whole current body of `src/app/admin/page.tsx` into `src/features/admin/admin-overview.tsx` as `export function AdminOverview()`, keeping `"use client"`. Then:

```tsx
// src/app/admin/page.tsx
import { redirect } from "next/navigation";
import { loadOfficial } from "@/lib/auth/load-official";
import { landingPathFor } from "@/lib/auth/official";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminOverview } from "@/features/admin/admin-overview";

export default async function AdminPage() {
  const gate = await loadOfficial();
  if (gate.state === "official" && gate.official.level === "barangay") {
    const { data } = await createSupabaseServerClient().from("zones").select("id, psgc_barangay_code");
    const path = landingPathFor(
      gate.official,
      (data ?? []).map((z) => ({ id: z.id, psgcBarangayCode: z.psgc_barangay_code }))
    );
    if (path) redirect(path);
  }
  return <AdminOverview />;
}
```

Move the existing page test to target `AdminOverview`.

- [ ] **Step 3: Scope each screen — tests first**

For each, write the test before the change. Use `renderWithData(ui, { official: <a real area> })` against the fixture zones, with at least one zone inside the area and one outside.

| Screen | Change | Test |
|---|---|---|
| `AdminOverview` | Every zone-based panel and KPI uses `zones.filter((z) => isInArea(z.psgcBarangayCode, official.areaCode))` | a zone outside the area does not appear |
| `admin-map-canvas.tsx` | Every zone still drawn; per-zone alert and headcount controls render only when `managesZone(zone)`; otherwise a **View only** label (both languages) | controls present for an in-area zone, absent with "View only" for another |
| `zone/[zoneId]/page.tsx` | When `!managesZone(zone)`: hide the alert, centre-status and headcount controls and show "View only — this barangay is outside your area" | same |
| `evacuation-management-panel.tsx` | Only in-area zones | a zone outside the area is absent |
| `community-pin-moderation-panel.tsx` | Only pins whose zone is in area | a pin in another area is absent |
| `flood-monitoring-panel.tsx` | Only in-area zones | same |
| `simulation/page.tsx` | The zone picker lists only in-area zones; the initial selection is the first in-area zone | the picker omits another area's zone |

`CheckInSummaryPanel` needs no change: the database already returns only in-area check-ins.

- [ ] **Step 4: Prove the tests bite** — for each screen, remove its filter or gate and confirm its named test fails. Then run the full suite: every existing admin test must still pass untouched, because `TEST_OFFICIAL` covers every fixture zone. If one fails, the change broke behaviour — fix the change, not the test.

- [ ] **Step 5: Gates, commit**

```bash
git add src/lib/auth src/app/admin src/features/admin
git commit -m "feat(admin): show every barangay, but only let officials act in their own area"
```

---

### Task 7: History

**Files:**
- Create: `src/lib/official-actions-mapper.ts` (+ test), `src/lib/official-actions-copy.ts` (+ test), `src/app/api/official-actions/route.ts` (+ test), `src/features/admin/last-change-line.tsx` (+ test), `src/app/admin/history/page.tsx`
- Modify: `src/app/admin/zone/[zoneId]/page.tsx`, `src/features/admin/admin-header.tsx`

**Interfaces:**
- Consumes: table `official_actions` (Task 2); `useOfficial`, `isInArea` (Tasks 5–6); `createSupabaseUserClient`.
- Produces: `interface OfficialAction { id: number; occurredAt: string; actorName: string; actorArea: string | null; action: string; zoneId: string | null; targetId: string | null; detail: Record<string, unknown> }`; `toOfficialActions(rows)`; `describeAction(action: OfficialAction, lang: LanguageCode): string`; `filterToArea(actions, zones, areaCode)`; `GET /api/official-actions?zone=&kind=alert&limit=`.

- [ ] **Step 1: Mapper and copy — tests first**

`toOfficialActions` maps snake_case rows to `OfficialAction`. This file has no `"use client"`, and `alerts-store.ts` must not re-export it — the same client-boundary rule `alerts-mapper.ts` documents.

`describeAction` returns one sentence per entry, in both languages, using the existing `SEVERITY_LABEL` and centre-status labels:

| Entry | English |
|---|---|
| `alert.set`, `from` null | "Set to Orange" |
| `alert.set`, `to` lower than `from` | "Lowered to Yellow" |
| `alert.set`, `to` higher than `from` | "Raised to Evacuate" |
| `alert.set`, `to` equal to `from` | "Confirmed Red" |
| `alert.cleared` | "Alert cleared" |
| `centre.status` | "Evacuation centre: Limited space" |
| `centre.occupancy` | "Headcount: 120" (or "Headcount cleared" when `to` is null) |
| `pin.removed` | "Pin removed" / "Pin removed automatically (net score)" |
| `pin.restored` | "Pin restored" |
| `official.appointed` | "Appointed {display_name} for {area_name}" |
| `official.removed` | "Removed {display_name}" |

Use `SEVERITY_ORDER` to compare. Test every row, and at least two rows in Filipino.

- [ ] **Step 2: The route — test first**

```ts
// src/app/api/official-actions/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { toOfficialActions } from "@/lib/official-actions-mapper";

const HEADERS = { "Cache-Control": "no-store, private" };

/**
 * Officials' read of the action record. RLS returns every entry to an
 * official and nothing to anyone else, so a resident who calls this gets [].
 * Never cached: it names officials. sw.js already sends /api paths that are
 * not on its public allowlist to the network uncached.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);

  const supabase = await createSupabaseUserClient();
  let query = supabase
    .from("official_actions")
    .select("id, occurred_at, actor_name, actor_area, action, zone_id, target_id, detail")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  const zone = params.get("zone");
  if (zone) query = query.eq("zone_id", zone);
  if (params.get("kind") === "alert") query = query.in("action", ["alert.set", "alert.cleared"]);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 502, headers: HEADERS });
  return NextResponse.json(toOfficialActions(data), { headers: HEADERS });
}
```

Tests: `zone`, `kind` and `limit` shape the query (assert on the mocked builder); the no-store header is present on both the 200 and the 502; `limit` is clamped to 1–200.

- [ ] **Step 3: The line beside the alert — test first**

`LastChangeLine({ zoneId })` fetches `/api/official-actions?zone=<id>&kind=alert&limit=1` on mount and renders `describeAction(entry)` + " by " + `actorName` + ", " + the time (`toLocaleTimeString` in the current language), or nothing when there is no entry or the fetch fails. Mount it beside the alert status on the Manage zone page.

Tests: renders the sentence for a mocked entry; renders nothing for `[]`; a failed fetch renders nothing and does not throw.

- [ ] **Step 4: The history page**

`src/app/admin/history/page.tsx` is a server component. It reads `scope` from `searchParams` (default `"mine"`), loads the official (`loadOfficial`) and the zones, and queries up to 200 entries newest first with the user client. For `scope=mine`, it keeps entries whose zone is in the official's area (`filterToArea`). Appointment entries (no zone) appear only under `scope=all`. Each row shows `describeAction`, the barangay name, `actorName` and the time. Two links switch **My area** / **All areas**. Add a **History** link to `AdminHeader`.

Test `filterToArea(actions, zones, areaCode)` as a pure function: keeps in-area entries, drops other areas and zone-less entries.

- [ ] **Step 5: Prove the tests bite, gates, commit**

```bash
git add src/lib/official-actions-mapper.ts src/lib/official-actions-copy.ts src/app/api/official-actions src/features/admin src/app/admin
git commit -m "feat(admin): show who changed what, beside each alert and on a history page"
```

---

### Task 8: Optional resident sign-in

**Files:**
- Create: `src/features/auth/account-link.tsx` (+ test)
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `getBrowserClient()`; the `/sign-in` page and `POST /auth/signout` (Task 4).

- [ ] **Step 1: Test first**

`AccountLink` (client) reads the browser session to decide what to **show** — the same display-only use of `getSession()` that `useSessionUserId` documents; nothing is authorised off it — and subscribes to `onAuthStateChange`:

| Session | Shows |
|---|---|
| none | nothing — a visitor who has never written has nothing to keep, and must not be signed in |
| anonymous | a link, "Keep your reports on a new phone", to `/sign-in?next=<current path>` |
| permanent | a **Sign out** form posting to `/auth/signout` with `next` = the current path |
| any, on a `/admin…` route | nothing (the admin header has its own sign-out) |

Tests: each row; and **the sign-in rule** — mounting it with no session never calls `signInAnonymously` (assert on the mocked client).

- [ ] **Step 2: Implement, mount it in the root layout's header beside `<LanguageToggle />`, prove the tests bite, gates, commit**

```bash
git add src/features/auth/account-link.tsx src/features/auth/account-link.test.tsx src/app/layout.tsx
git commit -m "feat(auth): let residents keep their reports on a new phone, if they choose"
```

---

### Task 9: Verify the barangay codes against the PSA list

The permission boundary depends on each zone's `psgc_barangay_code` being right. Three of the four demo codes end in `000` and look like placeholders.

**Files:** possibly `src/lib/mock-data/*` (the zone codes), `supabase/seed/seed.sql`, and the live `zones` / `municipalities` rows.

- [ ] **Step 1:** For each of the four barangays — Nilombot (Mapandan), Poblacion (Mangaldan), Poblacion (Manaoag) and Poblacion (Santa Barbara), all in Pangasinan — find its code in the **Philippine Statistics Authority's own PSGC publication** (psa.gov.ph). Use the origin publisher, not a third-party mirror or wrapper. Record each official code and the URL you read it from.
- [ ] **Step 2:** A town with several barangays named "Poblacion" is ambiguous: record which ones exist, and ask the controller which the demo zone represents rather than picking one.
- [ ] **Step 3:** If a code differs, update the mock zone, regenerate the seed, update the live `zones.psgc_barangay_code` and the `municipalities` row for that town, and re-run the database suite.
- [ ] **Step 4:** If the PSA publication cannot be reached, report **BLOCKED** with what you tried. **Do not guess a code.**
- [ ] **Step 5:** Gates and commit if anything changed.

---

### Task 10: PRD update

**Files:** `PRD.md`

Make exactly the changes in the spec's "PRD changes this design requires":

- [ ] **Roles:** replace "exactly two roles — operator and resident — with no per-officer accounts" with residents, barangay officials and municipal officials, and the system owner outside the app. Move "Role-based access for multi-officer LGU deployments" out of the later-stages list. Keep the "works at barangay scale with one operator" principle, and say why it still holds.
- [ ] **Stage 2 done-when:** replace "the operator PIN gate is live" with "officials sign in with their own accounts, each limited to their area, and every official action is recorded". Define "optional login works" as optional resident sign-in.
- [ ] **Roadmap re-scope:** move offline map tiles, real PAGASA/hazard data and self-hosted routing from Stage 2 to Stage 3, as one "geography and real data" theme alongside the country-wide barangay list and real GPS detection. State why: doing any of them for four barangays would be redone nationally.
- [ ] **Build Status:** replace the "Operator PIN gate — Not started" row (its note overstates today's risk — the database already refuses operator actions from non-operators). Add rows for Background Sync and error/uptime monitoring, both Stage 2 items missing from the table. Record the audit trail (layer 8) as partly delivered: official actions are recorded, automatic ones arrive with V1.
- [ ] **Privacy & Data:** officials' email addresses and display names are held; every official can read the action record; add retention rows for officials and the record.
- [ ] **Setup:** list the six setup steps from this plan, including the email templates.

The IDEA document is locked: nothing may contradict it. It names residents and "local DRRMOs" as the users, which this fits.

```bash
git add PRD.md
git commit -m "docs(prd): officials, areas and the action record replace the PIN gate"
```

---

### Task 11: Live end-to-end verification

**Before starting, confirm with the controller that setup steps 1, 2 and 3 are done.** Steps 4 and 6 are only needed for the email-link leg; if they are not done, skip that leg and say so.

Run the production build locally on port 3100 through the browser preview tooling (`weatherwell-prod` in `.claude/launch.json`); never `npm run dev` through Bash. It uses the live Supabase project.

**Agents never enter a password or a Google credential.** The Google leg is done by the user, in their own browser session.

- [ ] **Step 1 — residents unchanged.** Record `select count(*) from auth.users`. Open `/`, `/map`, `/report` and `/evacuation` and confirm the count is unchanged. File one report; confirm exactly one new anonymous user. Confirm no resident screen shows an official's name. The header shows "Keep your reports on a new phone" only after that first write.
- [ ] **Step 2 — test fixtures.** To have two barangays in one town, insert a temporary zone in Mapandan (`'0105528999'`, named "Barangay Testlive, Mapandan") with its centre. Use **one** browser identity: the anonymous user Step 1's report created. Promote it with SQL to barangay official for Nilombot (`update public.profiles set role = 'operator', area_code = <Nilombot's code>, display_name = 'Live Test Nilombot' where id = …`). This bypasses `appoint_official`, which requires an email account; it is a test-only shortcut, because real officials use permanent accounts. Later legs switch the same user's `area_code` with SQL — the gate re-reads the profile on every request. For a second official's actions, create a second identity with a real anonymous sign-up against the Auth REST endpoint, promote it, and act through PostgREST with its access token, as earlier plans' reviewers did.
- [ ] **Step 3 — scoping, in the browser.**
  - The Nilombot official lands on Nilombot's Manage zone page.
  - They can set Nilombot's alert.
  - Testlive shows **View only**.
  - Calling `set_zone_alert` for Testlive through the page's own Supabase client (in the page context — the real RLS boundary, whatever the UI shows) is refused with `42501`.
  - Switch the same user to municipal official for Mapandan (`area_code` = Mapandan's 7-digit prefix): they see the Mapandan overview and can act on both barangays.
- [ ] **Step 4 — the record.** Each change produced exactly one `official_actions` row with the right `actor_name` and `actor_area`. A lowered alert produced one `alert.set`, not two rows. The line beside the alert and the History page both show the entries.
- [ ] **Step 5 — removal.** Demote the test official with SQL mid-session. Their next action is refused, and `/admin` shows **Not appointed yet**.
- [ ] **Step 6 — the Google leg (the user).** Ask the user to open the local build, file a report so they have an anonymous session, then sign in with Google at `/sign-in?next=/admin`. Confirm their user id did not change (the link worked) and that they see **Not appointed yet** with their email. Run `private.appoint_official(<their email>, 'Nilombot, Mapandan', '<their name>')` and confirm the echo, and that they reach the dashboard. Then run `private.remove_official`.
- [ ] **Step 7 — the email leg**, if setup steps 4 and 6 are done: the same through "Email me a sign-in link".
- [ ] **Step 8 — clean up.** Delete the test users, the temporary zone and centre, every alert, and every `official_actions` row created during the test. Confirm the end-of-task state in Global Constraints.
- [ ] **Step 9 — report** every step's outcome. A step that fails is the finding; do not retry it until it passes.

---

## Carried forward, not in this plan

The other three V0 pieces get their own designs: the **outbox upgrade** (Background Sync, the outbox moving to storage the service worker can read, a retry cap, a visible "waiting to send" state, releasing delivered entries), **error and uptime monitoring**, and **honest "Use my location"**. Plan 4's smaller follow-ups remain in `docs/superpowers/plans/2026-09-09-v0-community-stores.md` under "Found during execution".

## Found during execution

Everything below surfaced while this plan ran — in task reviews, the live end-to-end run (15 September 2026) and the final whole-branch review — and is **not** fixed on the branch. The execution ledger that recorded it is scratch and is deleted when the plan completes, so it lives here.

**For the outbox-upgrade design**
- **Unauthored first write.** A resident's very first write is queued before any session exists, so it carries no author and is claimed by whoever next signs in on that device. Accepted for V0: only resident writes can be unauthored, and none reach the action record. Neither "stamp the anonymous id first" (impossible offline) nor "anonymous sessions only" (strands a genuine offline write) closes it.
- **Held entries look like the current person's own.** Entries held back because they belong to another user still render as the signed-in person's pending writes.
- **Cross-tab account change.** The cached session user id is refreshed only on page load and drain; if another tab switches accounts, a write can be stamped with the previous user.

**For V1 (geography and real data)**
- **Forged alert history.** `authenticated` holds INSERT on `alerts.superseded_severity` and `confidence`, so an in-area official inserting directly (not through `set_zone_alert`) can forge the "from" value the action record shows. Fix by making `set_zone_alert` the only writer — a security-model change.
- **Orphaned community pins** (a pin whose zone cannot be resolved) are hidden from every admin surface, with no in-app path for anyone to moderate them.
- **Unknown hazard data** is now shown as "Unknown / Hindi tiyak" and left out of the risk score instead of crashing. When the country-wide barangay list arrives, most barangays will be in this state — decide how the score and cautions should read with partial data.

**Before launch**
- **Email-link sign-in is untested live.** Google sign-in and anonymous-to-Google linking were verified live; the email link needs setup steps 4 (SMTP) and 6 (email template) first.
- **Never enable email autoconfirm.** `appoint_official` now requires a confirmed email; autoconfirm would let someone pre-register an official's address.

**Lesson from the live run**
- A test that drives a real barangay's controls writes to the shared database even when the page appears not to change. During the run, a real Warning was active on Nilombot for about 15 minutes. Live tests write only to a temporary zone.
