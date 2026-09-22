# V1 — Admin role, in-app official appointment, and password sign-in

**Date:** 2026-09-22
**Branch:** `v1`
**Status:** design approved conversationally; this document is that approval, written down.

**Relationship to earlier specs:** amends `docs/superpowers/specs/2026-09-11-v0-officials-and-roles-design.md`. That spec's decisions "How officials are appointed: by hand, by name" and "There is no admin screen and no in-app admin role" are **replaced** by this design, for one stated reason: those decisions optimized for a small number of officials appointed personally by the system owner outside the app. That is still true for admins (appointed by hand, in Supabase, never through the UI — this design does not change who can create an *admin*). It is no longer true for officials once an admin exists: an admin now appoints and removes officials from inside the app, auditable exactly like every other official action. Everything else in the 09-11 spec stands — area scoping, the action record, `manages_zone`, residents staying account-free.

---

## Why this exists

Three requests, one shape:

1. A tester needs to reach `/admin` and everything under it without depending on your own Google account or the "appoint by hand in Supabase" ceremony every time.
2. A tester needs to see the *official* experience (one area, no appointment powers) distinctly from the *admin* experience (every area, can appoint/remove officials).
3. `admin@weatherwell.com` is not a real Google account, so it needs a password to sign in with at all — which means password sign-in (removed earlier this session, see commit `f06fc75`) comes back.

---

## Decisions

### Who can do what (extends the 09-11 table with a new column)

| | Resident | Official (barangay or municipality) | Admin |
|---|---|---|---|
| See alerts, map, evacuation route | Every barangay | Every barangay | Every barangay |
| Report water level, drop and vote on pins, check in | Yes | Yes, as a resident | Yes, as a resident |
| Raise, lower or clear an alert | — | Own area | Any area |
| Update evacuation-centre status and headcount | — | Own area | Any area |
| See check-ins | Only their own | Own area | Any area |
| Remove or restore pins | Withdraw own pin only | Own area | Any area |
| Read the action record | — | All areas | All areas |
| Appoint and remove officials | — | — | **Yes, in-app** |
| Appoint and remove admins | — | — | No — still by hand, in Supabase, by you |

An admin is a superset of an official: everywhere the database already checks "is this person an official for this zone," it now also passes for an admin, for every zone. This is the whole mechanism — see below.

### Settled choices

| Question | Decision | Why |
|---|---|---|
| How the admin role is represented | A third `profiles.role` value, `'admin'`, alongside the existing `'resident'` / `'operator'` | `'operator'` already means "official"; reusing it and distinguishing admin by a sentinel `area_code` was considered and rejected — it would make `area_code`'s meaning context-dependent, and `areaLevel()`'s `10 digits = barangay / else = municipality` logic would need a special case anyway. A real third value is one honest name instead of an overloaded one. |
| How admin gets an official's privileges everywhere, for free | Widen the two functions every official-gated RLS policy already calls through (`private.is_operator()`, `private.manages_zone()`) to also accept `role = 'admin'` | Every alert write, pin moderation, check-in read, and centre update policy in the 09-05/09-11 migrations is already built on these two functions. Widening them once, instead of touching each policy, is the same reasoning the 09-11 spec gives for enforcing area limits in the database instead of the app: one rule, checked everywhere, nothing to miss. |
| How an admin appoints/removes an official | A new pair of `SECURITY DEFINER` functions (`private.admin_appoint_official`, `private.admin_remove_official`) that check the caller's `profiles.role = 'admin'`, then delegate to the existing `private.appoint_official` / `private.remove_official` logic | The original functions stay exactly as locked down as the 09-11 design made them (`execute` revoked from every role, including `service_role` — callable only by you, directly, as database owner). This is a **new, separate, audited path**, not a loosening of the old one: the old "by hand in Supabase" escape hatch still exists if the app is ever broken. |
| How the audit log attributes an admin-driven appointment | `appoint_official`/`remove_official`'s existing call to `record_official_action` passes a hardcoded `'System owner'` today, regardless of caller — that's a one-line bug this design would otherwise inherit silently. Changing that one argument to `null` lets `record_official_action`'s own actor lookup run instead: called from the SQL editor (no `auth.uid()`), it still resolves to `'System owner'`, unchanged; called through the new admin wrapper (a real authenticated session), `auth.uid()` resolves to the calling admin, and the lookup (already widened above) finds their `profiles` row and attributes the action to them by name | Caught in spec self-review: the wrapper alone doesn't fix attribution, because the function it delegates to overrides the actor unconditionally. No new parameter needed — `record_official_action` already does the right thing once it's allowed to run. |
| Who can create a new admin | Nobody, from the app. Still you, by hand, in Supabase. | An admin that could mint other admins is the single point of failure the 09-11 spec explicitly designed *out* for officials ("one official per barangay is a single point of failure"). No in-app path exists to become or appoint an admin; there is exactly one way in, and it is you. |
| Password sign-in | Restored: `signInWithPassword` / `signUpWithPassword`, same shape as before `f06fc75` removed them, still linking to an existing anonymous session when one exists | This is the only way `admin@weatherwell.com` — not a real Google account — can sign in at all. Magic-link is **not** restored: it never worked (no SMTP configured on this project, the actual reason it was removed), and nothing in this request asks for it back. |
| Self-serve password sign-up and the "Confirm email" setting | Sign-up is restored, but a self-registered account cannot complete sign-up until you manually turn off Supabase's "Confirm email" requirement (Dashboard → Authentication → Sign In / Providers → Email) | Same root cause as the magic-link failure: no SMTP means no confirmation email ever arrives. This is outside every tool available to me — it is a one-time Dashboard toggle only you can flip. The three seeded test accounts below do not depend on this; they are created already confirmed. |
| **Accepted risk:** disabling "Confirm email" weakens `appoint_official`'s anti-impersonation check | Ship it anyway, for this test build | `appoint_official`'s own migration comment (`20260915075527_harden_appointment_and_action_grants.sql`, "M6") states its `email_confirmed_at is not null` guard is "safe today only because email autoconfirm is off." With it off, any self-signed-up account is auto-confirmed at signup, so that guard can no longer prove the signer owns the inbox — someone could self-register an official's real email before the real person does, and be appointed in their place if whoever appoints them (you, or an admin) trusts the email match alone instead of also verifying identity out-of-band (a step this project's process already assumes, per the 09-11 spec's "appointed by hand, by name"). Confirmed acceptable for a hackathon test build; flagged here so it isn't silently forgotten if this project ever handles real officials' appointments again. |
| How the 3 test accounts are created | A one-off script (`scripts/create-test-accounts.ts`, same shape as the existing `scripts/generate-seed.ts`) using the service-role key and Supabase's Admin API (`auth.admin.createUser`, `email_confirm: true`), then a direct update to each new user's `profiles` row | Inserting directly into `auth.users` via raw SQL is a well-known Supabase foot-gun (the password hash format and the `auth.identities` row it also needs are undocumented and version-dependent) — Supabase's own guidance is to always go through the Admin API. This also matches how every other privileged write in this codebase already goes through a service-role client, not raw SQL against `auth.*`. |

---

## The 3 accounts

| Email | Password | `profiles.role` | Area |
|---|---|---|---|
| `admin@weatherwell.com` | `<redacted>` | `admin` | — (system-wide) |
| `official@weatherwell.com` | `<redacted>` | `operator` | Barangay Nilombot, Mapandan |
| `user@weatherwell.com` | `<redacted>` | `resident` | — |

All three are created already email-confirmed, so they work regardless of the "Confirm email" Dashboard setting. **These are real credentials in the live production Supabase project**, exactly as asked for — not a separate staging environment. They will appear in `auth.users` and, once run, in `git log` for the seed script (the script contains the emails and the fact that it sets a password via the Admin API, but the Admin API call itself does not require or log the plaintext password back to us — Supabase never returns it).

---

## Code changes

**Database (new migration, in order):**
1. `profiles.role` check constraint: `'resident','operator'` → `'resident','operator','admin'`.
2. New constraint: `role <> 'admin' or display_name is not null` (admin needs a name for the action-record actor field, exactly like official already does) — `area_code` is left unconstrained for admin (stays `null`).
3. `private.is_operator()`: `role = 'operator'` → `role in ('operator','admin')`.
4. `private.manages_zone(p_zone_id)`: add `or p.role = 'admin'` alongside the existing area-prefix match.
5. `private.record_official_action()`'s actor lookup: `role = 'operator'` → `role in ('operator','admin')`.
6. `private.appoint_official` / `private.remove_official`: the hardcoded `'System owner'` passed to `record_official_action` becomes `null`, so it resolves the real caller (see the attribution row above) — the only change to these two functions; everything else about them, including their lockdown, is untouched.
7. New `private.admin_appoint_official(p_email, p_area, p_display_name)` / `private.admin_remove_official(p_email)`, `security definer`, checking `profiles.role = 'admin'` for `auth.uid()` before calling the existing `private.appoint_official` / `private.remove_official`. Granted `execute` to `authenticated` (the gate inside the function is what actually restricts this, the same pattern `set_zone_alert` already uses).

**Server Actions:** `src/app/actions/appoint-official.ts`, `src/app/actions/remove-official.ts` — thin wrappers calling the two new RPCs, following the existing `set-zone-alert.ts` shape (server-only, typed input/output, no business logic duplicated from the database).

**Auth types and gate:** `src/lib/auth/official.ts` — `Official.level` gains a third value, `"admin"` (alongside `"barangay" | "municipality"`); `areaLevel()` needs no change (admin's `area_code` is `null`, never passed to it). `src/lib/auth/load-official.ts` — `GateState` keeps its existing three variants (`signed-out` / `not-appointed` / `official`); no new variant. An admin still comes back as `{ state: "official", official: { level: "admin", areaCode: "", ... } }` — every existing `gate.state === "official"` check (the `/admin` layout, `AdminHeader`, etc.) keeps working unchanged, and the few places that need to tell an admin apart from an area-scoped official (the new `/admin/officials` page, and `AdminPage`'s barangay-redirect, which must not fire for `level === "admin"`) switch on `official.level` instead.

**New admin UI:** `src/app/admin/officials/page.tsx` (and a small `AppointOfficialForm` / `OfficialsList` component pair under `src/features/admin/`) — visible only when `gate.official.level === "admin"`; the appoint form takes email, area (barangay "Name, Town" or municipality name — the same free-text format `appoint_official` already parses), and display name; the list shows current officials with a Remove action per row.

**Password auth:** `src/lib/auth/sign-in.ts` gets `signInWithPassword` / `signUpWithPassword` back (restored from `git show f06fc75^:src/lib/auth/sign-in.ts`, unchanged). `src/features/auth/sign-in-panel.tsx` gets the password form and the sign-in/sign-up toggle back, dropping only the magic-link half of the old UI.

**Test account script:** `scripts/create-test-accounts.ts`, run once manually (`npx tsx scripts/create-test-accounts.ts`), not part of any build step.

---

## Testing

- `supabase/tests/rls.sql`: widen the existing `is_operator()`/`manages_zone()` invariant tests to cover an admin role acting on a zone with no matching `area_code` — must pass; a plain resident acting the same way — must still fail.
- New RLS tests for `admin_appoint_official`/`admin_remove_official`: an admin caller succeeds; an official or resident caller is rejected; the resulting `profiles` row and `official_actions` audit row are correct.
- `src/features/auth/sign-in-panel.test.tsx`: restore the password-path tests `f06fc75` removed, adapted to the current file (Google-only tests already there stay).
- `src/lib/auth/load-official.test.ts` (or wherever `loadOfficial` is covered): new case for `role = 'admin'`.
- New tests for the admin officials page: appoint form success/failure, remove action, and that an official (non-admin) visiting `/admin/officials` cannot see it.

## Out of scope (deliberately)

- Admins appointing other admins, from the app, ever.
- Magic-link sign-in (never worked here; not requested).
- A password-reset flow (not requested; the 3 test passwords are fixed on purpose).
- Changing anything about how residents sign in or don't.
