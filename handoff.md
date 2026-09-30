# Handoff — 29 September 2026

## State

- `mvp` was merged into `v1` on 25 September. `v1` is the default branch and the production branch; `mvp` stays at `0b9f0fd` for reference.
- **On `v1`, not pushed and not released** (30 September): limits for pins, votes and photos, the first of four approved plans. The first section below.
- **Production runs `4057809`**, released on 30 September as `dpl_EsTauojzpkGCWE1QPBCdFRr34Q2U` after CI run #128 passed: the server functions in Tokyo, a weekly encrypted backup, and `/api/route`'s limits counted exactly in the database. The first section below.
- Before that, production ran `12a24c6`, promoted on 29 September from the Vercel dashboard after CI run #125 passed (the Vercel connector was failing, so its deployment id is not recorded here): the "Fix the map" link beside the map's OpenStreetMap credit (`c2bc778`). The first section below.
- Before that, production ran `b7b17e6` (`dpl_7hvjZwFretu7RPNuynnSstp6VoJT`, CI run #123): Next.js 16.3.7 for a security fix, and limits on how often `/api/route` asks the walking router. Also the first section below.
- Earlier on 29 September it ran `37a793c` (`dpl_64s7sTC5FzB3Wv8ZgNnvPzigprpa`, CI run #121): pin types and photos for officials, and a Find safe evacuation center that points somewhere safe. They are the second and third sections below.
- Before that, production ran `4f592b6` (officials fill in their barangay's details, below, released on 28 September). Before it ran `dea649b` (changing and viewing a barangay, below), and before that `d4ac54a` (the review fixes below), released later on 26 September. Before that, `ddf7293` was released as `dpl_DAEpr9WuSe9jkLvzPLWoHsPcQf8B` after CI run #115 passed, shipping these commits on top of `8fa9dd9`:

| Commit | What |
|---|---|
| `43d3145` | Read-aloud on the evacuation instructions, and English with a note when the phone has no Filipino voice (Task 5) |
| `bdf075b` | DB: the calibration loop and confidence tags; `supabase/tests/calibration.sql` (Task 3) |
| `1045501` | App: confidence tags on alerts, each barangay's own bar in the report counts, the Calibration panel for officials (Task 3) |
| `1e63060` | The WCAG 2.1 AA audit's fixes (Task 4) |
| `e2cc8a9` | `/admin/history` describes a calibration move and an admin's password reset in words |
| `ddf7293` | Docs: PRD Build Status and Setup step 10, the Stage 4 plan, README and this handoff (Task 2) |

- The calibration migration `20260926010743_calibration_loop` went live before the release; it only adds, so the earlier build ran safely with it.
- Checked on production after the release: the 8 public pages tried each have their own title, `/api/health` reports the database ok with no recent errors, and `/api/alert-bars` answers (no barangay's bar has moved yet).
- `pg_cron` now starts the GitHub workflows on time. The owner put the token in Vault at 02:18 UTC on 26 September, and the first dispatched Monitor run started at 02:30 UTC and passed.
- The Nilombot test alert (yellow, set by Test Official at 22:17 on 25 September) was lifted at 02:21 UTC on 26 September. The action record shows it as cleared by the System owner. No push or email went out, because it was lifted in the database, not through the app.

### Limits for pins, votes and photos, 30 September (built, not released)

The first of the four approved plans (`docs/superpowers/plans/2026-09-30-pin-vote-photo-limits.md`). **On `v1`, not pushed and not released.**

| Commit | What |
|---|---|
| `d8b481c` | `20260930070414_pin_vote_photo_limits`, applied to the live database: a pin more than 15 km from its barangay is refused (`too_far`), and one account places 5 pins (officials not counted) and casts 30 votes an hour (`rate_limited`); the photo upload policy allows 10 a day, counted by `private.my_photo_uploads_today()`. `abuse.sql` P1-P4, V1-V2, PH1-PH2, L3 |
| `e53b110` | `createPin` and `voteOnPin` return the refusal's reason |
| `9f4df46` | The outbox badge names each limit; the pin form says when the day's photos are used up |

- **The migration is live and refuses writes now.** Until the release, the production app shows a refused pin or vote as a generic failure and retries a rate-limited one later. The database holds 2 pins, so nobody is near a limit.
- Checked on the live database in a script that rolled back: every new test block passes, and one real resident upload still works under the new policy (a policy's function call is resolved when the policy is made, so the uploader needs no access to `private`; only a direct call would).

### Tokyo region, weekly backups and exact route limits, 29 September

Three of the recommendations the owner said to do all of. The other four are specs the owner approved on 30 September, in `docs/superpowers/specs/`; their plans come next:

- `2026-09-29-flood-profile-and-downstream-heads-up-design.md`: officials set their barangay's flood, landslide and storm-surge levels and its downstream barangay; the Hazards layer shows them; Warning or Evacuate upstream tells the downstream officials (officials only, the owner's decision).
- `2026-09-29-residents-data-rights-design.md`: download and delete in Settings; reports are anonymised, not deleted (the owner's decision).
- `2026-09-29-pin-vote-photo-limits-design.md`: pins within 15 km of their barangay, 5 pins and 30 votes an hour, 10 photos a day.
- `2026-09-29-rain-heads-up-design.md`: a Forecast advisory hours ahead of heavy rain for towns with officials (the owner chose this first step of prediction).
 **Released on 30 September (`dpl_EsTauojzpkGCWE1QPBCdFRr34Q2U`).**

| Commit | What |
|---|---|
| `4aa3f35` | The server functions run in Tokyo (`"regions": ["hnd1"]` in `vercel.json`), beside the database (`ap-northeast-1`). In Washington every database call crossed the Pacific: timed from the Philippines, `/api/pins` took 0.7 to 1.2 s and `/api/health` 1.4 to 2.6 s, against 0.2 s for a static file |
| `521adc3` | `.github/workflows/backup.yml`: every week, the roles, schema, data and migration history, encrypted with gpg (AES-256) and kept 30 days as an artifact of the run; `pg_cron` starts it on time (`20260929144202_dispatch_backup`). README: Backups, for setting it up and restoring |
| `1baedad` | `public.take_rate_limit` counts requests in `private.rate_limit_counts` (`20260929144851_rate_limits`); `/api/route` asks it after its in-memory first line, the caller first and its address only as a keyed hash, then the app-wide router budget. If the database cannot answer, the walk goes ahead. `abuse.sql` L1-L2 |

- **Both migrations are live already.** `dispatch_backup` adds a weekly `pg_cron` job; `rate_limits` adds a private table, a function only the service role may call, and an hourly clean-up job. Both only add, and the running code does not use them until the release. The rate limit was checked on the live database in a block that rolled back: the server's calls counted `{t,t,f,t}`, and anonymous and signed-in callers were refused; nothing was left behind.
- **The backup needs two secrets from the owner** (README, Backups): `SUPABASE_DB_URL`, the Session pooler connection string with the database password in it, and `BACKUP_PASSPHRASE`, kept somewhere outside GitHub too. Until they are there, each weekly run fails and emails the owner. Then run Actions → Backup once and check the run ends with a `.gpg` artifact.
- Checked on production after the release: `x-vercel-id` reads `sin1::hnd1::…`; timed from the Philippines, `/api/health` answered in 0.33 to 0.60 s (1.4 to 2.6 s before) and `/api/pins` in 0.28 to 0.32 s (0.7 to 1.2 s before); a real walking route came back (5.9 km); that request left one `route:caller:<hash>` row and one `route:router` row in `private.rate_limit_counts`; health is ok and the pages answer. The service worker stays v25: no code that runs on the phone changed.

### Next.js security update and the router's limits, 29 September

A follow-up to a check of the running app. **Released on 29 September (`dpl_7hvjZwFretu7RPNuynnSstp6VoJT`).**

| Commit | What |
|---|---|
| `0655bed` | Next.js 16.3.7, which carries 16.3.6's fix for GHSA-vcvr-r3jv-pc5j (remote code execution in `next/og`'s `ImageResponse`; WeatherWell does not use `next/og`, so it was not exposed); `npm audit fix` (fast-uri and undici, used only by shadcn's command-line tools; the audit now finds nothing); the last two lint warnings; service worker v24 |
| `9594c28` | `/api/route` asks FOSSGIS at most 10 times in any 10 seconds for the whole app, and takes 20 requests a minute from one address; past either it answers 429 and the screen draws the marked straight line. The limiter moves to `src/lib/rate-limit.ts`, which `/api/push` now uses too (same limit, 10 a minute) |

- **No database change.** The service worker goes to v24 for the deploy.
- **Why these numbers:** FOSSGIS's usage policy allows one request a second at most, from the whole app. A search asks about up to 3 places, so 20 a minute is several searches from one address, with room for the many phones a mobile carrier puts behind one address. In a surge of more than about one search a second across the town, the extra residents get the marked straight line until the budget refills; self-hosting the router is still the fix for that.
- **The counts live in each server instance's memory**, so two warm instances allow twice as much. A shared count in the database is the upgrade if that ever matters. (Done since `1baedad`, the first section above.)
- Checked on production after the release: service worker v24 is served; `/api/health` reports the database ok with no recent errors; `/`, `/evacuation`, `/report`, `/map`, `/resident`, `/onboarding`, `/sign-in` and `/admin` answer; `/api/route` returns a real walking route (the same 5.9 km pair as before) and 405 for GET; `/api/cleanup-pin-photos` answers 401 without the secret.
- **The limit works, but production splits the counts across at least two server instances.** 26 quick requests from one address all passed; in 80 more, the first 429 came at the 12th, and 29 were refused. So the real ceilings are a few times 20 a minute per address and 10 in 10 seconds for the app, which can still be more than FOSSGIS's one a second in a surge. A made-up `X-Forwarded-For` does not get round it (10 of 12 were still refused), so Vercel sets the address the route sees. A shared count in the database would make the limits exact.
- **"Fix the map"** (released later on 29 September): FOSSGIS's policy also asks for a "fix the map" link (https://www.openstreetmap.org/fixthemap) beside the OpenStreetMap credit. `c2bc778` adds it to the credit in `src/features/map/map-shell.tsx`, which every map in the app uses, split by Leaflet's own separator, which screen readers skip; service worker v25. Checked on production after the release: v25 is served, `/api/health` reports the database ok with no recent errors, the pages (with `/admin/map`) answer, and the shipped map code carries the link. Not looked at on a phone: every map sits behind the consent notice or a sign-in.

### Pin types and photos for officials, 29 September

A pin now says what is happening: Flood (flooded, rising, receding or impassable), Road blocked, Landslide, Power line down or Other. A resident can add one photo to a new pin; only officials see it, for 7 days. Designed in `docs/superpowers/specs/2026-09-28-pin-types-and-photos-design.md`, planned in `docs/superpowers/plans/2026-09-28-pin-types-and-photos.md`, and reviewed by a fresh reviewer at the end. **Released on 29 September (`dpl_64s7sTC5FzB3Wv8ZgNnvPzigprpa`).** Alongside it, a barangay's marker no longer vanishes when you zoom in on it (`0e20a16`: the cap on markers kept the wrong barangays, and 5,898 lost theirs at some zooms; none do now).

| Commit | What |
|---|---|
| `ef46351` | DB: `community_pins_status_tag_check` (the 8 tags), the private `pin-photos` bucket (500 KB, JPEG or WebP), `attach_pin_photo`, `pin_photos_to_delete` |
| `918aae3` | The five kinds in the pin form, the map, the legend and the lists |
| `604e162` | Add a photo: shrunk on the phone (1280 px, at most 500 KB, which drops where it was taken), a one-time notice, sent for officials only |
| `ad5f42c` | Officials see the photo through a one-hour link, on the barangay page and the Operations map |
| `3370b74` | `/api/cleanup-pin-photos`, a daily Vercel cron (03:00 UTC): deletes photos after 7 days, when their pin is removed, or after an hour if never attached |
| `8917185`, `2884a34` | A lint fix in the form; PRD and README |
| `5f1050e`, `27c5fd8`, `7b56971`, `7703765`, `1ea661b` | The review's fixes, below |

- **One migration, applied to the live database already:** `20260928132821_pin_types_and_photos`. It adds a constraint, a bucket, two policies and two functions. The old `rls.sql` fixtures used a tag the constraint refuses (`passable`), which would have stopped CI at the first fixture; fixed in `27c5fd8`, and checked once on the live database in a rolled-back transaction.
- **The review's fixes:** the page's security policy blocked every photo for officials (`img-src` now lists Supabase); a form closed while its photo uploaded still queued the pin; a connection lost after picking a photo dropped it silently; a stalled upload held the pin back (20 seconds, then it goes without the photo); the full-size viewer opened inside a map popup and was clipped; the form, the add button and the viewer still said "flood".
- Not fixed, minor: Send pressed while the photo is still being shrunk sends the pin without it; the cleanup deletes files before clearing `photo_path`, so a very large backlog could leave pins pointing at deleted photos ("Photo unavailable"); a momentary failure of `attach_pin_photo` loses the photo; the camera opens directly (`capture`), so a photo already in the gallery cannot be picked; thumbnails download the whole photo; one database test is missing (an attached photo over an hour old on a live pin is not deleted).
- **A phone still running the v21 code** throws on a pin type it does not know and shows the error card until it reloads. Navigations are network-first, so the next visit fixes it.
- Anyone with an anonymous session can upload files of up to 500 KB into their own folder; unattached files go within about 25 hours. Since `20260930070414_pin_vote_photo_limits`, one account uploads at most 10 a day.
- Checked on production after the release: `/api/cleanup-pin-photos` answers 401 without the cron secret; the page's security policy lists Supabase in `img-src`; `/api/pins` and the pages answer. **Not tried by hand:** a real photo upload by a resident and the view by an official (needs their sessions). The cron's first run happened: the database's API log shows `pin_photos_to_delete` answered 200 at 03:36 UTC on 30 September.

### Find safe evacuation center, 29 September

"Find safe evacuation center" and "Find safe area" now point somewhere safe. Before, they picked by list order (in a barangay under Evacuate, the next barangay in the nationwide list: hundreds of kilometres away), drew the line from the barangay's point, checked a placeholder path and used a car router. Designed in `docs/superpowers/specs/2026-09-28-find-safe-evacuation-centre-design.md`, planned in `docs/superpowers/plans/2026-09-28-find-safe-evacuation-centre.md`, and reviewed by a fresh reviewer at the end. **Released on 29 September (`dpl_64s7sTC5FzB3Wv8ZgNnvPzigprpa`).**

| Commit | What |
|---|---|
| `4ed0266` | `POST /api/route` asks the free FOSSGIS walking router for alternatives, and falls back to a marked straight line |
| `f9da984` | `src/lib/safe-route.ts`: the nearest usable place within 10 km and the first route that avoids barangays under Warning or Evacuate and blocking pins |
| `1df151c` | The home screen: `use-safe-route.ts`, the panel, the route and the destination on the map. The old `use-route-finding.ts` and `route-hazard.ts` are gone |
| `ffcaae7` | The consent notice names the walking route planner; `CONSENT_VERSION` `2026-09-28` (everyone sees the notice once more); service worker v23; PRD and README |
| `ae7f233`, `de94eef` | The review's fixes, below |

- **No database change.** The service worker goes to v23 and the consent version changes, so every phone shows the notice once and takes the new code on its next open.
- What it does: confirmed centres first, else likely sites from OpenStreetMap (marked "Not confirmed by your barangay"); a place in a barangay under Warning or Evacuate, or a full centre, is skipped. Alternatives are checked against barangays under alert (500 m of their point) and against standing Road blocked, Landslide, Power line down or Impassable pins from the last 24 hours (50 m). If every route passes something, the least affected is shown and says what is on it. Offline it gives a straight line to the nearest usable confirmed centre; if the router does not answer, a straight line, marked. The call button (the barangay's hotline, else 911) always shows.
- **The review's fixes:** likely sites inside a barangay under alert were offered (the plan had dropped the spec's rule); a neighbour under Evacuate beside the start made every route unclean in a city; the pins checked were the copy the phone kept from when the app opened; the phone gave up on the likely-site search at 15 seconds when the server may take 33; a dead router was asked again for every place; thousands of barangays under alert froze a tap.
- Not fixed, minor: a straight line that passes something is drawn dashed red with no explanation; "turn on location" also shows while a fix is still coming; "a Impassable pin"; "Find safe area" in a barangay with no alert names your own barangay.
- Checked on production after the release: service worker v23 is served; `/api/route` answers with a real walking route from FOSSGIS (one route, not several, for the pair tried: 5.9 km, 79 minutes), and with 400 for a bad body and 405 for GET; `/api/health` reports the database ok with no recent errors; `/`, `/evacuation`, `/report`, `/map`, `/resident`, `/onboarding`, `/sign-in` and `/admin` answer. **Not tried by hand:** the walk coming into view on a phone (`FitRoute`) and the panel with a live position.
- **Limits to know:** the FOSSGIS router is a volunteer service that allows one request a second; `/api/route` keeps to that since `9594c28` (the first section above), and self-hosting the router is the follow-up. `/api/alerts` returns at most 1,000 rows, so in a very large event some barangays under alert are invisible to the whole app. Bringing a route into view (`FitRoute`) and the alternatives FOSSGIS returns were not exercised in a real browser.

### Officials fill in their barangay's details, 28 September

Officials enter what residents had only as placeholders: up to 3 hotline numbers, the evacuation instructions (English, Filipino or both; a blank language shows the other, marked with its real language) and the centre, picked from OpenStreetMap or placed on a map. Designed in `docs/superpowers/specs/2026-09-28-barangay-details-design.md`, planned in `docs/superpowers/plans/2026-09-28-barangay-details.md`, reviewed by a fresh reviewer (Opus; Fable had no usage credits), and **released on 28 September as `dpl_BgPg4GTEKAzDYJiT6oMxfi3SzGru` (`4f592b6`)** after CI run #120 passed, database suites included.

| Commit | What |
|---|---|
| `c521f22` | No grey hazard ring around every barangay while hazard data is unknown |
| `9f75477` | DB: `set_barangay_details` (area-checked, recorded as `barangay.details`), `zones.extra_hotlines` and `details_set_at` |
| `ed6d71a` | The rules and wording for numbers and instructions, in both languages |
| `c53248e` | `/api/barangay-details`, laid over the offline file and kept by the service worker (v21) |
| `d287ffb` | A call button for each number; every call link dials digits only |
| `21f0a5e` | Edit barangay details on the barangay page |
| `d238197` | Place the centre on a map |
| `6c2a971` | Operations map and Drill in the barangay officials' menu; Drill in the town's |
| `df9f0e6` | Docs: PRD and README |
| `66c9141` | The review's fixes: a centre confirmed without a capacity reaches phones (`evacuation_centers.confirmed_at`); "(+63)" numbers dial right; whitespace-only boxes are blank; the official's next open shows the new details; the plan shows the instructions without a centre; the placeholder is not offered as the official's words; errors name their field; instructions in one language are marked with it |
| `4f592b6` | The new database checks use fixture ids no other block uses (CI run #119 failed on the clash) |

- Two migrations came with it, applied live before the release: `20260928083830_barangay_details` and `20260928123726_barangay_details_fixes`. Both only add, or replace a function with the same signature and grants.
- Checked on production after the release: service worker v21 lists `/api/barangay-details`; the feed answers (empty until an official saves); `/api/centres` lists the one confirmed centre; the pages answer; the new wording is in the served code; and `/api/health` reports the database ok with no recent errors.
- Not fixed, minor: pasted numbers with non-breaking spaces, en dashes or dots are refused; "Saved — residents see it the next time their app opens" is one open early; on a very slow first load the feed can overwrite a just-saved change on the official's screen; odd capacities show an untranslated message; focus and screen-reader details in the new forms; the centre panel's loading state; two test gaps; one PRD line reads as if the details function also saves the centre.

### Changing and viewing a barangay, 28 September

Residents can change their barangay after setup, look at another barangay without changing theirs, and report where GPS puts them. Designed in `docs/superpowers/specs/2026-09-26-change-and-view-barangay-design.md`, planned in `docs/superpowers/plans/2026-09-26-change-and-view-barangay.md`, reviewed by a fresh reviewer at the end, and **released on 28 September as `dpl_hyBRodJ4LUgpJcbkoJUUWU4RhrWo` (`dea649b`)** after CI run #117 passed. No migrations.

| Commit | What |
|---|---|
| `892bc66` | My barangay can change while the app is open; every screen follows it |
| `1ce023a` | "Change" on the home screen and on your own card in the Zones list; email alerts follow the change |
| `c206d0c` | View another barangay (`/?zone=`), with Back to my barangay and My location; push stays on mine |
| `5bdae0d` | A report counts where GPS puts you, or for your barangay without a position; the danger banner speaks Filipino |
| `c682ece` | The Zones list's View and Evacuation open the barangay on the card |
| `1ff8eb7` | A viewed barangay opens offline from the cached page (service worker v20) |
| `dea649b` | The review's fixes: within 2 km of your barangay's centre a report stays yours; the screen starts afresh on a change; push follows a change made anywhere; `/evacuation?zone=` says whose it is |

- **The home radius is 2 km** (`HOME_RADIUS_METERS` in `src/lib/where-you-are.ts`), kept by the owner on 28 September. Larger keeps more reports at home, including some made just across the border; smaller hands at-home reports to a neighbour in dense towns.
- Not fixed, minor: the picker hides "Use my location" before consent instead of pointing to the notice; Change is offered offline, where the search cannot work; "Palitan" and "Baguhin" name the same step; the push line shows even when push is off; clearing storage in another tab goes unnoticed; while viewing, My location does not name where you are.
- Checked on production after the release: service worker v20 is served with the offline rule for pages with a query; `/`, `/evacuation`, `/report` and `/map` answer, with and without `?zone=`; the new wording is in the served code; and `/api/health` reports the database ok with no recent errors.

### Code review of the session, 26 September

A self-review of `0b9f0fd..ddf7293` (the review agents hit their usage limit) found 15 issues. Fixed in these commits, **released on 26 September as `dpl_5a8ZnfuYFip7K2uqAEFLvPqCGGWL` (`d4ac54a`)** after CI run #116 passed, database suites included:

| Commit | Fix |
|---|---|
| `8c84424` | A report sent without a location no longer counts toward "enough neighbours" or "Threshold met" (the engine never counts it) |
| `a9f0411` | DB: a missed event is only what the raised bar kept quiet; one rule for the reports that count, `private.report_evidence` |
| `f3eb5ea` | `/onboarding` is precached (service worker v19), so a new consent version never strands a resident offline |
| `6e8fc9d` | "How high am I?" waits for the consent notice |
| `145bbbd` | A town's calibration record is filtered in the query, before the 30-row limit |
| `801de6a` | A queued report's rate-limit note never outlives the wait |
| `251f5fe` | `/api/alert-bars` reads past PostgREST's 1,000-row page |
| `0888fb2` | The bar is described one way on the dashboard and in the action record |
| `065d91b` | Monitor fails, and so emails the owner, once Supabase has not started a run for an hour (an expired Vault token) |
| `39bddbb` | DB: a report's refusal carries a HINT (`too_far`, `rate_limited`) that the app matches, not the wording |

- Three migrations came with them, applied live before the release: `20260926062134_report_located_flag`, `20260926062859_missed_needs_floor_evidence` and `20260926064539_report_refusals_carry_hints`.
- Checked on production after the release: service worker v19 precaches `/onboarding`, `/api/reports` carries `located`, `/api/alert-bars` answers, and `/api/health` reports the database ok with no recent errors.
- Left for the owner to decide:
  - **Undo is still 3 seconds.** WCAG 2.2.1 prefers 20 seconds or a way to extend it, but a longer undo holds every report back that much longer before it is sent.
  - **Page titles stay in English** when the app is in Filipino. Localizing them needs the language to reach the server (a cookie), because Next.js metadata is rendered there.
- Not fixed, minor: each component that shows a bar fetches `/api/alert-bars` itself (the CDN caches it for 60 seconds).
- The leftover `tests` schema (5 helper functions from an earlier test run, among them `as_user`) was dropped from the live database on 29 September, at the owner's word. A rolled-back check on the live database now runs `supabase/tests/helpers.sql` inside its own transaction first, so the helpers go when it rolls back.

## Stage 4 exit criteria

| Criterion | State |
|---|---|
| Anti-abuse layers 1–6 live, abuse-attempt suite passes | Met. `abuse.sql` runs in CI |
| Calibration loop run against a real event | Built and recording. Needs a real flood; so far only labelled test advisories exist |
| WCAG 2.1 AA audit, no outstanding violations | Met on 26 September, after `1e63060` |
| Pilot drill, feedback incorporated or deferred | The owner's. Drill mode is at `/admin/simulation` |

## Owner steps, in order

1. **Remove the leftover `mapandanofficial@weatherwell.com` account.** It is still appointed as a municipal official for Mapandan. Remove it at `/admin/officials` while signed in as the admin, so the record names who removed it; then delete the user in Supabase → Authentication → Users. Deleting the user alone also works, because its profile and appointment go with it.
2. **Pilot drill** with a barangay, then log its feedback as incorporated or deferred.
3. **Add the two backup secrets** and run Actions → Backup once (README, Backups).
4. **Try the two new features on production:** add one photo to a pin as a resident and open it as an official (this proves the upload with the insert-only policy, the one-hour link and the page's security policy); tap Find safe evacuation center once and check the walk comes into view. (The photo cleanup's first run is confirmed.)

## Owner's decisions (26 September)

- Calibration: "Auto, floor stays". The loop moves each barangay's bar by itself, logs every move to the action record, and never goes below 3 reporters and trust 1.0.
- The test accounts keep their current passwords.
- Barangays: "My barangay + view others". Alerts come for the barangay a resident picks; a report counts where GPS says they are.
- Home radius (28 September): 2 km stays. Within it, a report counts for the resident's own barangay.
- Barangay details (28 September): one language is enough for the instructions; up to 3 hotline numbers; stored in the barangay's own row.
- Pins and photos (29 September): photos for officials only, kept 7 days. The kinds: Flood (flooded, rising, receding, impassable), Road blocked, Landslide, Power line down, Other.
- Find safe evacuation center (29 September): walking routes from routing.openstreetmap.de (so the consent version goes up); confirmed centres first, else likely sites, marked; prefer a route around blocking pins and barangays under Warning or Evacuate, and warn.

## Open work

- The calibration loop's first real event: record the outcome in the Stage 4 plan when one happens.
- Not started, listed in the PRD Build Status:
  - Real hazard data: every barangay's hazard is "Unknown", so the map's Hazards layer draws nothing until it is loaded.
  - The prediction engine, so `predicted_timing` stays empty and the loop compares outcomes, not timings.
  - The cascade heads-up downstream.
  - Self-hosted routing: directions use FOSSGIS's free walking router, a volunteer service that allows one request a second; past that, residents get the marked straight line.
  - Data export and deletion (RA 10173 Article 16).
  - Clean-up of unused anonymous identities.

## Risks to keep in mind

- **Test passwords:** they were shared in chat and are kept by the owner's decision, and the admin test account controls the live system.
- **Impersonation:** with email confirmation off, anyone can register any email. Confirm an official's email by phone or in person before appointing them, and prefer their Google account.
- **Security questions:** someone who knows the resident can guess the answers. The limit is 5 tries an hour per email, with no per-IP limit.
- **Email volume:** a free Gmail account sends about 500 emails a day.
- **The bar only rises with officials' verdicts.** An official who rejects correct advisories raises their barangay's bar; the dashboard's Calibration panel shows every move.
- **Abuse the database cannot stop** (the `abuse.sql` header): GPS spoofed to a point inside the barangay, identities made a day ahead, several established identities agreeing on "dry", and new anonymous identities, limited only by Supabase's per-IP rate limit.

## Checks

- App: `npm run lint`, `npm run typecheck`, `npm test`, `npm run knip`, `npm run build`.
- Database: start Supabase the way CI does, then run `helpers.sql`, `reference-tables.sql`, `rls.sql`, `abuse.sql`, `accounts.sql` and `calibration.sql` with `psql` (see `.github/workflows/ci.yml`).
- Last run, 29 September, locally: 1,907 app tests pass; lint, typecheck, knip and build are clean, with no warnings. The database suites run in CI on every push.

## Where things live

- Calibration: the `20260926010743` and `20260926062859` migrations (`private.report_evidence` is the one rule for which reports count), `supabase/tests/calibration.sql`, `src/features/admin/calibration-panel.tsx`, `src/features/alerts/confidence-tag.tsx`, `src/app/api/alert-bars/route.ts` and `alertBar` in `src/lib/weather-thresholds.ts`.
- Read-aloud: `src/features/alerts/read-aloud-button.tsx`.
- Accessibility: `src/features/map/map-centre-placer.tsx`, and the tests `src/app/colour-contrast.test.ts` and `src/app/page-titles.test.ts`.
- Scheduling: the `20260925135257` migration.
- Anti-abuse: the `20260925123429` migration and `supabase/tests/abuse.sql`.
- Barangay details: `src/features/admin/barangay-details-form.tsx`, `src/features/evacuation/place-centre-on-map.tsx`, `src/lib/barangay-details.ts` (the rules, `telHref`, `instructionsFor`), `src/app/api/barangay-details/route.ts`, `applyDetailsOverlay` in `src/lib/reference-data/types.ts`, and the `20260928083830` and `20260928123726` migrations.
- Changing and viewing a barangay: `src/features/zones/change-barangay-dialog.tsx`, `barangay-bar.tsx` and `use-viewed-zone.ts`; `src/lib/where-you-are.ts` (`HOME_RADIUS_METERS`); `src/lib/follow-email-alerts.ts`; `followPushSubscription` in `src/lib/push-subscription.ts`; `pageWithQuery` in `public/sw.js`.
- Pin types and photos: `src/lib/community-pin.ts` (the kinds and their labels), `src/lib/pin-photo.ts` (shrink and upload), `src/features/admin/pin-photo-thumb.tsx`, `src/app/api/cleanup-pin-photos/route.ts`, the `20260928132821` migration and the PT block in `supabase/tests/rls.sql`.
- Find safe evacuation center: `src/lib/safe-route.ts` (the rules), `src/features/homepage-map/use-safe-route.ts` and `safe-route-panel.tsx`, `src/app/api/route/route.ts`.
- Rate limits: `src/lib/rate-limit.ts` (in memory, per instance), used by `src/app/api/route/route.ts` and `src/app/api/push/route.ts`; the exact count is `public.take_rate_limit` (`20260929144851_rate_limits`).
- Backups: `.github/workflows/backup.yml`, `20260929144202_dispatch_backup`, README "Backups".
- Consent notice: `CONSENT_ITEMS` in `src/features/onboarding/consent-notice.tsx`, versioned by `CONSENT_VERSION` in `onboarding-storage.ts`.
