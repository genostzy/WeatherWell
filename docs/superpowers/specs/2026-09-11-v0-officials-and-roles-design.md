# V0 — Officials, Areas and the Action Record

**Date:** 2026-09-11
**Branch:** `v0`
**Stage:** 2 (`v0` · Functional build)
**Status:** design approved section by section in conversation (sections 1–5). Two additions made afterwards, to keep V1 from reworking this, are marked **Added — confirm at review**.

**Relationship to earlier specs:** extends `docs/superpowers/specs/2026-09-05-v0-supabase-data-layer-design.md`. That spec's decision 4 ("Operator role: a `profiles` row promoted by hand") and its deferred "Operator PIN gate" are **replaced** by this design. Everything else in it stands.

---

## Why this exists

V0 cannot be finished while `/admin` is open to anyone. The data-layer spec planned a shared PIN gate for that. A shared PIN fails the way this app is actually used:

- An operator is today an anonymous device session promoted by hand. If that official clears their browser or changes phones, their authority is gone, and there is no way to confirm who they are.
- A shared PIN cannot be revoked for one person and cannot say who acted.
- One official per barangay is a single point of failure during a night flood.
- Floods cross barangay lines, and in practice the municipal disaster office coordinates across barangays. The app already models upstream/downstream barangays.

So officials get their own accounts, work as teams, are limited to an area, and every change they make is recorded.

**What is already true and stays true.** Since the data-layer work, the database refuses every operator action from anyone who is not an operator. A stranger who opens `/admin` today can look but cannot change anything. This design is about letting the *right* people act, attributably, within the right area.

---

## Decisions

### Who can do what

| | Resident | Barangay official | Municipal official | System owner |
|---|---|---|---|---|
| See alerts, map, evacuation route | Every barangay | Every barangay | Every barangay | — |
| Report water level, drop and vote on pins, check in | Yes | Yes, as a resident | Yes, as a resident | — |
| Raise, lower or clear an alert | — | Own barangay | Any barangay in their town | — |
| Update evacuation-centre status and headcount | — | Own barangay | Their town | — |
| See check-ins | Only their own | Own barangay | Their town | — |
| Remove or restore pins | Withdraw own pin only | Own barangay | Their town | — |
| Drill mode (notifies nobody) | — | Yes | Yes | — |
| Read the action record | — | All areas | All areas | Yes, in Supabase |
| Appoint and remove officials | — | — | — | Yes, by hand in Supabase |

A municipal official may act on a barangay that has its own official. That is deliberate: the town can step in when the barangay official is asleep, evacuating or out of signal. The action record shows who did what.

The system owner works outside the app, as owner of the Supabase and Vercel projects. There is no admin screen and no in-app admin role.

### Settled choices

| Question | Decision | Why |
|---|---|---|
| How officials sign in | **Google first, email link as backup** | Nearly every Philippine smartphone is Android and already signed into Google; a Google account is personal and hard to share, which keeps the action record meaningful. The email link covers officials without Google. Phone + SMS is the most familiar pattern in the Philippines but costs money per message. Facebook accounts are often shared or hacked. |
| Who can read the action record | **Every official, every area** | Floods cross town lines; a downstream town benefits from seeing that an upstream barangay went to Evacuate. These are public officials acting in an official role. Condition: the record holds no resident personal data, and the dashboard shows the official's own area first. |
| How officials are appointed | **By hand, by name** | A command that takes a barangay or town *name*, not a code. For a handful of officials this is safer than an admin screen, whose account would be the most valuable target in the system. |
| How the area limit is enforced | **By the database** | One security rule checks every read and write. A bug in the app cannot hand an official another area's data. The same reasoning made the data-layer spec reject service-role writes. |

---

## Identity and sign-in

**Residents: unchanged.** No sign-in screen and no account required. A resident's identity is still created on their first report, pin, vote or check-in, never on a page load. Every anonymous sign-in is a permanent `auth.users` row, which is why this rule stays.

**Officials** sign in at `/sign-in` with **Continue with Google**, or **Email me a sign-in link**. The page sits outside `/admin`, so the dashboard's gate can never redirect to itself, and residents' optional sign-in uses the same page.

- If the phone already carries an anonymous resident session, sign-in **links** the new identity to it (`supabase.auth.linkIdentity({ provider: 'google' })`, or `updateUser({ email })` for the email link). The user id does not change, so the official's earlier reports and pins stay theirs. This requires Supabase's **manual linking** setting to be on.
- If linking fails because that Google account or email already belongs to another user, the official is signed into that account instead. The anonymous session's earlier writes stay attributed to the old anonymous user. Nothing is lost from the database; the official simply does not carry that phone's resident history across.
- A new sign-in reuses the existing `auth.users` trigger that creates a `profiles` row with role `resident`.

**Signing in does not make someone an official.** A signed-in person who has not been appointed sees a **Not appointed yet** page showing their email address, which they send to the system owner.

**Sessions** last weeks, so an official signs in once before the rainy season. There is a **Sign out** button. Removing an appointment takes effect on the official's **next** request, because the database checks the appointment on every read and write. There is no need to find the device.

**Server trust is unchanged:** server code reads identity only through `getClaims()`, which verifies the JWT signature. Nothing authorises off `getSession()` or off the user-editable `user_metadata`.

**Auth callback.** OAuth and email links return to a new `/auth/callback` route handler that exchanges the code for a session (PKCE) and redirects to the requested page. It is never cached (see [Service worker](#service-worker)).

---

## Areas and permissions

### The area is a prefix of the barangay code

Philippine barangay codes (PSGC) are hierarchical. In `0105528012`:

| Digits | Meaning |
|---|---|
| `01` | Region I (Ilocos) |
| `055` | Pangasinan |
| `28` | Mapandan (the town) |
| `012` | Nilombot (the barangay) |

- A **barangay official's** area is the full 10-digit code.
- A **municipal official's** area is the 7-digit town prefix.
- A provincial level, if ever needed, is a 5-digit prefix. Nothing else changes.

This works for every barangay in the country, not only the four in the demo data.

### Data model

```sql
alter table public.profiles
  add column area_code    text check (area_code ~ '^(\d{7}|\d{10})$'),
  add column display_name text,
  add constraint operator_has_area_and_name
    check (role <> 'operator' or (area_code is not null and display_name is not null));

create table public.municipalities (
  code text primary key check (code ~ '^\d{7}$'),   -- the 7-digit PSGC town prefix
  name text not null                                 -- e.g. 'Mapandan'
);
```

- `area_code` is digits only, enforced by the check, so it can be used safely in a prefix match.
- `display_name` is set by the system owner at appointment — for example "Juan Dela Cruz, BDRRMO Nilombot". It is **never** taken from the Google profile, which the user can edit.
- Internally the role stays named `operator`, matching the PRD's term. Screens say "official".
- `municipalities` is reference data: world-readable, never client-writable. It is seeded for the demo towns.
- Clients still have **no** INSERT or UPDATE grant on `profiles`, so no one can change their own role, area or name.

### The one rule

```sql
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
```

- `language sql`, not plpgsql. A plpgsql body referencing `private.*` names resolves them lazily as the invoking role, and `authenticated` has no USAGE on schema `private`. That exact shape shipped broken in Plan 3 and was hidden by the test suite.
- EXECUTE stays granted to `authenticated`, because policies call the function while running as `authenticated`. Revoking it broke policy evaluation in Plan 1. The function cannot be called through the API: schema `private` is not exposed (PostgREST answers `PGRST106`).
- It only answers "do **I** manage this barangay", so it discloses nothing about anyone else.
- `private.is_operator()` stays, meaning "is an official anywhere". It gates reading the action record and opening `/admin`, and no longer authorises any change to a specific barangay.

### What the rule replaces

Every place where "is an operator" currently authorises an action on a specific barangay switches to `private.manages_zone(zone_id)`:

| Object | Today | Becomes |
|---|---|---|
| `alerts` INSERT policy | `is_operator()` | `manages_zone(zone_id) and source = 'manual'` (see [Built for V1](#built-for-v1-added--confirm-at-review)) |
| `alerts` UPDATE policy (USING and WITH CHECK) | `is_operator()` | `manages_zone(zone_id)` |
| `evacuation_centers` UPDATE policy | `is_operator()` | `manages_zone(zone_id)` |
| `community_pins` UPDATE policy | author or `is_operator()` | author or `manages_zone(zone_id)` |
| `pins_protect_moderation_columns` trigger `WHEN` | `not private.is_operator()` | `not private.manages_zone(new.zone_id)` |
| `evacuation_check_ins` SELECT policy | own or `is_operator()` | own or `manages_zone(zone_id)` |
| `profiles` SELECT policy | own or `is_operator()` | **own only** — the action record carries name snapshots, so no official needs to read other profiles |

`public.set_zone_alert` stays `SECURITY INVOKER`, so the alerts policies above decide who may call it effectively. A resident, or an official outside the area, writes nothing.

Because the check is a prefix, a municipal official automatically covers every barangay in their town, including one with no barangay official. Each official has exactly one area.

### Appointing and removing officials

Two commands, run only from Supabase's SQL editor:

```sql
select private.appoint_official('juan@gmail.com', 'Nilombot, Mapandan', 'Juan Dela Cruz, BDRRMO Nilombot');
select private.appoint_official('maria@gmail.com', 'Mapandan',           'Maria Santos, MDRRMO Mapandan');
select private.remove_official('juan@gmail.com');
```

- The area argument is a barangay (`'<Barangay>, <Town>'`) or a town (`'<Town>'`), resolved against `zones` and `municipalities`. An ambiguous name (for example "Poblacion", which exists in many towns) is refused with a message listing the matches.
- The command **echoes exactly what it granted**, such as `Maria Santos, MDRRMO Mapandan is now an official for Mapandan — covers 1 barangay: Nilombot`, so a wrong area is visible immediately.
- It refuses an email with no account yet: *"Ask them to sign in once first."*
- Both commands live in schema `private` with EXECUTE revoked from `public`, `anon`, `authenticated` and `service_role`. Only the database owner can run them. No official can appoint anyone.
- Removal sets the role back to `resident` and clears the area. The action record keeps the name snapshot, so history still says who acted.
- Both commands write an entry to the action record, with the actor shown as **System owner**.

---

## The action record

### What is recorded

One entry per decision:

| Action | Recorded when | Detail |
|---|---|---|
| `alert.set` | An alert row is inserted | `{"from": <superseded severity or null>, "to": <severity>}` |
| `alert.cleared` | A zone ends a transaction with no active alert, having had one | `{"from": <severity withdrawn>}` |
| `centre.status` | `evacuation_centers.status` changes | `{"from": …, "to": …}` |
| `centre.occupancy` | `evacuation_centers.current_occupancy` changes | `{"from": …, "to": …}` |
| `pin.removed` | `removed` goes false → true by an official, or automatically by net score | `{"reason": "admin" \| "net_score"}` |
| `pin.restored` | `removed` goes true → false | `{}` |
| `official.appointed` | `appoint_official` runs | `{"area": <code>, "area_name": …}` |
| `official.removed` | `remove_official` runs | `{"area": <code>}` |

Not recorded: a resident withdrawing their own pin (not an official action), and officials *viewing* check-ins (see [Risks](#risks-and-open-questions)).

### Shape

```sql
create table public.official_actions (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),   -- the server's clock
  actor_id    uuid,                                   -- null for automatic actions and the system owner
  actor_name  text not null,                          -- snapshot: display_name, 'Automatic — net score', 'System owner'
  actor_area  text,                                   -- snapshot of the actor's area code
  action      text not null check (action in (
                'alert.set','alert.cleared','centre.status','centre.occupancy',
                'pin.removed','pin.restored','official.appointed','official.removed')),
  zone_id     text references public.zones (id),
  target_id   text,                                   -- alert, pin or centre id, or the appointee's user id
  detail      jsonb not null default '{}'             -- only the changed fields; never resident data
);
create index on public.official_actions (zone_id, occurred_at desc);
```

- The name and area are copied into the entry at that moment. If Juan is later removed or renamed, the history still says Juan.
- **No resident data.** A pin entry records the pin id and barangay, never its caption or author. Check-ins never appear.

### Written by the database, not the app

- Entries are written by `AFTER` triggers on `alerts`, `evacuation_centers` and `community_pins`, whose functions are `SECURITY DEFINER` plpgsql in schema `private`. Definer functions run as the owner, which has USAGE on `private`, so the Plan 3 lazy-resolution trap does not apply. `private.apply_net_score_removal` already has this shape and works.
- Nothing in the app can skip an entry: not a bug, and not someone calling the API directly with an official's session.
- **One entry per decision.** `set_zone_alert` deactivates the old row and inserts the new one in one transaction. Recording the deactivation separately would double every change. So the insert records `alert.set` (with the superseded severity as `from`), and a `DEFERRABLE INITIALLY DEFERRED` constraint trigger records `alert.cleared` only if the zone ends the transaction with no active alert.
- **Attribution.** The actor is `auth.uid()`, looked up in `profiles` for the name and area snapshot. A pin change with `removed_reason = 'net_score'` is attributed to **Automatic — net score**, not to the voter whose vote tripped the trigger. An alert written with no `auth.uid()` (V1's automatic engine, running server-side) is attributed to **Automatic — <source>**.
- **Append-only.** `anon` and `authenticated` have no INSERT, UPDATE or DELETE grant and no write policy on `official_actions`. Only the database owner could alter entries.
- Kept permanently. It contains no resident data.

### Who can read it

`select to authenticated using ((select private.is_operator()))`: every official reads every entry (decision C). Residents cannot read it at all. Residents' screens never show officials' names; the downgrade notice keeps its current wording and states no reason.

---

## Dashboard changes

Still **one** dashboard with the same four screens. Each now knows who is looking.

**The gate.** An `/admin` layout (a server component) reads the verified claims and the caller's profile:

| Caller | Sees |
|---|---|
| Not signed in | `/sign-in?next=/admin` |
| Signed in, not appointed | **Not appointed yet**, with their email |
| Official | The dashboard |

This gate only decides what to show. The database is still the lock: every change and every check-in read is refused outside the official's area, however the request arrives.

**Per screen:**

- **Header:** the official's name and area ("Juan Dela Cruz — Barangay Nilombot") and **Sign out**.
- **Dashboard home (`/admin`):** a barangay official is taken straight to their barangay's Manage zone page. A municipal official sees today's overview, filtered to their town's barangays.
- **Operations map (`/admin/map`):** shows every barangay, because floods cross boundaries. Controls work only inside the official's area; other barangays are marked **View only**.
- **Check-in summary and pin moderation:** the official's own area only.
- **Drill mode (`/admin/simulation`):** unchanged — it notifies nobody — and limited to the official's own barangays.
- **Manage zone (`/admin/zone/[zoneId]`):** beside the alert, the latest record entry: "Lowered to Advisory by Juan Dela Cruz, 2:14 AM". A barangay outside the official's area opens view-only.
- **History (`/admin/history`, new):** every recorded action across all areas, newest first, opening filtered to the official's own area with a filter to see others.

**Failures stay visible.** Operator writes already show their failure in both languages next to the control. That covers the case where an appointment is removed mid-session.

**New pages:** `/sign-in`, the not-appointed state, `/admin/history`, and the `/auth/callback` route.

---

## Optional resident sign-in (Added — confirm at review)

The PRD's V0 done-when says **"optional login works"**. This design reads that as residents, and meets it with the same sign-in machinery officials use:

- A small **Keep my reports on a new phone** option in the app header that opens `/sign-in`, never shown as a gate and never required.
- It links Google or an email to the resident's existing anonymous identity (the same `linkIdentity` / `updateUser` path as officials), so their reports, pins, votes and check-in follow them to a new phone.
- It never runs on page load, and a resident who never taps it stays exactly as they are today.
- It costs nothing extra: a linked account is the same `auth.users` row, not a new one.

Why now rather than later: MVP's reputation scoring (anti-abuse layer 6) needs identities that last longer than a browser's storage, and V1's push subscriptions attach to an identity. Building the linking once, for officials and residents together, means neither stage has to build it again.

---

## Built for V1 (Added — confirm at review)

V1 makes the core mechanism live: reports automatically triggering alerts, push delivery with retry, anti-abuse layers 1–3 and the audit trail. These choices mean V1 extends this design rather than replacing it:

1. **One alert path for people and machines.** `public.set_zone_alert` gains a `p_source` parameter defaulting to `'manual'`. Officials reach it through RLS, and the alerts INSERT policy pins their rows to `source = 'manual'`, so an official cannot make an alert look automatic. V1's threshold engine runs server-side with the service role (which bypasses RLS) and calls the same function with `'auto_crowdsourced'`. The one-active-alert rule, the superseded severity behind the downgrade notice, and the action record then work identically for automatic alerts, with no second code path.
2. **The action record is the audit trail.** The PRD schedules the audit trail (anti-abuse layer 8) for V1 and has V1's analytics "rewired from mock data onto that real audit trail". The record is shaped for that: a typed `action`, a `zone_id`, timestamps, and `detail` holding before/after values, with automatic actors supported from the start. V1 adds action types (for example `push.sent`, `push.failed`, `alert.auto_triggered`) to the check constraint; it does not build a second log.
3. **Areas are already national.** The prefix rule works for every PSGC code, so V1's country-wide barangay list needs no change to permissions.
4. **Lasting identities.** Optional resident sign-in (above) gives V1's push subscriptions and MVP's reputation scoring identities to attach to.

---

## Setup the system owner does (free, once)

1. **Google sign-in.** Create an OAuth client in Google's developer console and paste its ID and secret into Supabase (Authentication → Providers → Google). The consent screen must be moved out of "Testing", or only listed test users can sign in. Basic sign-in scopes (email, profile) should need no Google review — confirm during setup.
2. **Manual linking.** Switch it on in Supabase's auth settings. Without it, the resident-to-official upgrade fails.
3. **Redirect URLs.** Add the app's addresses — the V0 link now, production later — to Supabase's allowed redirect URLs.
4. **Email sending, before launch.** Supabase's built-in sender only delivers to addresses pre-authorised in the Supabase organisation and is not meant for real use. Connect a free SMTP service so the email-link backup can reach officials. Google sign-in does not depend on this.
5. **Vercel settings.** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must be ticked for **Preview** as well as Production, or the V0 link cannot reach Supabase.

Each involves entering a secret or changing account settings, so the system owner does them.

---

## Service worker

- **`/admin` leaves the install-time pre-download.** `PRECACHED_ROUTES` currently includes `/admin`, `/admin/map` and `/admin/simulation`. Once `/admin` needs a sign-in, pre-downloading it would save the sign-in page on every device and serve it back in place of the dashboard. An official's own visits are still cached by the existing network-first navigation handling, so their last-seen dashboard opens without signal.
- **`/auth/*` is never cached**, in either direction, alongside the existing `/api/check-ins` branch.
- `VERSION` is bumped. The file's header requires it for any routing change.
- Official actions still go straight to the server rather than the offline queue — the Plan 4 decision stands.

---

## Build order

Each step leaves the app working.

1. **Database.** `profiles` columns and constraint, `municipalities` (seeded), `private.manages_zone`, the policy and trigger changes above, `set_zone_alert`'s `p_source`, the appointment commands, `official_actions` and its triggers. With zero officials today, switching the rules breaks nothing.
2. **Sign-in.** `/sign-in`, `/auth/callback`, the anonymous-to-permanent linking, the `/admin` gate and the not-appointed state, Sign out, and the service-worker changes.
3. **Dashboard scoping.** The header, the barangay-official landing page, view-only barangays on the map and Manage zone, and filtered lists.
4. **History.** The line beside each alert, and `/admin/history`.
5. **Optional resident sign-in** — if confirmed at review.
6. **Live test.** Needs setup steps 1–3 and 5 done first. Real Google sign-ins: two barangay officials in the same town, one municipal official, and one resident. Prove each can act only in their area, that every action lands in the record exactly once with the right name, and that removing an appointment takes effect on the next action.
7. **PRD update** (see below).

**Before real use:** check every seeded `psgc_barangay_code` against the PSA's official PSGC list. Three of the four demo codes end in `000` and look like placeholders. The permission boundary depends on these codes being right.

---

## Testing

**Database (`supabase/tests/rls.sql`).** Every denial is paired with the corresponding permission, and every assertion is proven to fail when the protection it guards is removed:

- A barangay official can raise an alert in their own barangay, and cannot in a neighbouring barangay of the same town.
- A municipal official can act across their town, and cannot in another town.
- An official reads check-ins only within their area.
- An official cannot insert an alert with a `source` other than `'manual'`.
- An official can restore a pin in their area, and cannot outside it (the moderation trigger).
- Residents cannot read `official_actions`; officials can read all of it.
- Nobody using the app can insert, update or delete an `official_actions` entry, or execute the appointment commands.
- Removing an appointment takes effect on the next statement.
- Each action type writes exactly one entry with the right actor name and area; a lowered alert writes one `alert.set`, not a deactivation plus an insert; a clear writes one `alert.cleared`.
- A net-score removal is attributed to **Automatic — net score**, not to the voter.
- A resident cannot change their own `role`, `area_code` or `display_name`.

**Application.** Unit and component tests for the gate's three states, the header, area filtering, view-only rendering and the history view. Standing practice: every new test is proven to fail when the behaviour it names is broken.

**Live.** Build-order step 6.

---

## PRD changes this design requires

- **Who It Serves / roles.** Replace "exactly two roles — operator and resident — with no per-officer accounts" with residents, barangay officials and municipal officials, and the system owner outside the app. Move "Role-based access for multi-officer LGU deployments" from the later-stages list into what V0 builds. The principle "works at barangay scale with one operator" still holds: a barangay with one official works, and so does one with none, because the municipal official covers it.
- **Stage 2 done-when.** Replace "the operator PIN gate is live" with "officials sign in with their own accounts, each limited to their area, and every official action is recorded". Define "optional login works" as optional resident sign-in, if confirmed.
- **Roadmap — V0 re-scope.** Move **offline map tiles**, **real PAGASA and hazard data** and **self-hosted routing** from Stage 2 to Stage 3 as one "geography and real data" theme, alongside the country-wide barangay list and real GPS detection. Doing any of them for four barangays now would be redone nationally in V1.
- **Build Status.** Replace the "Operator PIN gate — Not started" row. Its note overstates today's risk: since the data-layer work, the database refuses operator actions from non-operators. Add rows for **Background Sync** and **error/uptime monitoring**, which are Stage 2 items missing from the table. Record the audit trail (layer 8) as partly delivered: official actions are recorded; automatic actions arrive with V1.
- **Privacy & Data.** Officials' email addresses and display names are now held. Every official can read the action record. Add a retention row for officials and for the action record.

---

## Out of scope

| Deferred | Where it goes |
|---|---|
| Background Sync, and the outbox moving to storage the service worker can read | Separate V0 spec: outbox upgrade (with the retry cap, a visible "waiting to send" state, and releasing delivered entries) |
| Error and uptime monitoring | Separate V0 spec |
| Honest "Use my location" | Separate small V0 change |
| Country-wide barangay list, real GPS detection, barangay boundaries | V1, "geography and real data" |
| Offline map tiles, real PAGASA/hazard data, self-hosted routing | V1, "geography and real data" |
| An admin screen for appointing officials | When appointments become a chore |
| A provincial level | When needed — a shorter prefix, no other change |
| Recording who *viewed* check-ins | When check-ins gain names or locations |

---

## Risks and open questions

- **Two officials acting on one barangay at once.** The last change wins. The partial unique index already prevents two active alerts, and the history shows the order.
- **An official signed in on a shared family phone** stays signed in until they sign out. Mitigation: the Sign out button, and the system owner can remove the appointment.
- **The email-link backup does not work** until an SMTP service is connected (setup step 4).
- **The rescue gap.** A check-in holds only an anonymous id, "safe" or "needs help", and a time. An official can see that *someone* in a barangay needs help, but not who or where. That is a product decision beyond this design. If check-ins ever gain names or locations, recording who viewed them becomes worth doing.
- **Wrong barangay codes grant the wrong area.** The PSGC check before real use is a hard prerequisite, not a nicety.
- **Ambiguous barangay names.** The appointment command refuses them rather than guessing.
- **An official moving to another area** is removed and re-appointed. Their earlier entries keep the old area snapshot.
- **Google consent screen.** If it is left in "Testing", only listed test users can sign in.
