# Session Summary

**Date**: 2026-09-04 15:26 → 2026-09-05 10:44
**Project**: WeatherWell (C:\Users\Wilson\WeatherWell), branch `hi-fi`
**Description**: Dead-code sweep, CI + knip, README rewrite, PRD restructured for submission, service-worker rewrite, four-pass code review, production deploy and verification

---

## What We Worked On

### Dead code and tooling
- Ran **graphify** twice over the repo. First pass surfaced `getRecentReportsForZone` (unused mock helper); second pass surfaced `useHasVotedOnPin`. Both deleted.
- Set up **knip** (`knip.jsonc`) to catch unused files, exports, and dependencies going forward — `public/sw.js` declared as an entry point so the service worker isn't reported as orphaned; `src/components/ui/*.tsx` ignored (shadcn vendor surface) but their tests kept in scope.
- Added **CI** (`.github/workflows/ci.yml`): lint → typecheck → test → knip → build, on every push, Node 24, concurrency with cancel-in-progress.
- Added the CI status badge to the README, then **rewrote the README entirely** — the create-next-app boilerplate was still there.

### The CI failure that taught us something
First CI run failed on `Cannot find name 'LayoutProps' / 'PageProps'`. These are **Next-generated route types** that don't exist on a clean checkout. Per AGENTS.md, read the bundled docs in `node_modules/next/dist/docs/` rather than guessing: the fix is `next typegen && tsc --noEmit` as the `typecheck` script. Verified locally by deleting `.next` first.

### PRD restructured for submission (due Tue 8 Sept 2026)
The PRD had drifted into being a Hi-Fi build log rather than a product document. Restructured to ~6,357 words around a submission narrative:
- **"How to read this document"** framing section.
- **"How This Answers the Challenge"** — a table mapping each of the challenge's three problem clauses onto the specific mechanism that answers it.
- **"Built to load on a bad connection"** — records the deliberate choice of a low-cost design over animation-heavy sites, with the measured 230 KB figure.
- **Build Status table**, dated, then **checked row-by-row against the actual code** — five rows were wrong and were corrected.
- **Stages 1–4** with measurable exit criteria; a passed code review added to Stage 1's exit bar, and the PIN gate added to Stage 2's.
- Constraint held throughout: the IDEA was submitted early and can no longer be edited, so **the PRD must not contradict or wander from it**.

### Fixes
- **Timestamp hydration bug** — elapsed-time text ("N min ago") was being server-rendered, so SSR and client disagreed. Added `src/lib/use-hydrated.ts` (`useHasHydrated` via `useSyncExternalStore`) and `src/components/time-ago.tsx`, which renders the elapsed time only after hydration and takes a `prefix` so the separator disappears along with it.
- **Localisation** — the last untranslated user-facing strings, including `share-alert-button.tsx` emitting `alert.severity.toUpperCase()` instead of the localised `SEVERITY_LABEL`.
- **Service worker rewritten** (`public/sw.js`) — was a blunt cache-first strategy pinning users to a stale build. Now per-request-type: alerts network-first with no timeout, `/api/zones` stale-while-revalidate, `/_next/static/` cache-first, navigations network-first with a 3 s timeout, everything else stale-while-revalidate. Install uses per-route `cache.add().catch()` instead of all-or-nothing `addAll`. Versioned caches, bumped to **v3**. `service-worker-registration.tsx` now registers in production only and actively unregisters + clears `weatherwell-` caches in dev.
- Wrote `src/lib/service-worker.test.ts` — 11 tests that evaluate the **real** `public/sw.js` in a `node:vm` sandbox with a fake Cache Storage, and parse `VERSION` out of the source so routine bumps don't break the suite.
- Renamed all `climate-resilience-and-hydrometeoro` references to `weatherwell`.

### Four-pass full-branch code review
Reviewed the whole branch, fixed, re-reviewed, repeated until a pass came back clean (pass 4). Seven correctness bugs found. **Five of them were one underlying defect**: an operator's decision not being honoured downstream —
- `zone-overrides.ts` carried an alert's base *copy* onto a *different* severity, so a downgraded zone showed "Evacuate immediately" under an Advisory badge. Base copy now survives only while the severity it was written for does.
- `resolveEffectiveCenterStatus` took capacity/occupancy as optional, so a caller who simply forgot them got a plausible wrong answer. Made them required (`number | undefined`) — omitting is now a compile error, passing `undefined` is a decision.
- `routeCrossesHazard` now requires a `zoneStatusOf` resolver rather than resolving internally, so route checks and destination checks can't diverge.
- `use-route-finding.ts` now rejects hazardous *destinations*, not just hazardous routes.
- `buildZoneInputForZone`'s upstream-alert argument made required.

Every behavioural fix was confirmed to **fail its test when reverted**; two were made compile errors instead of tests.

### Deploy and verification
- Bumped VERSION, rebuilt, deployed, pointed Vercel's production branch at `hi-fi`, promoted to production.
- Production URL in use: `https://weatherwell-wilsondayritjrapex-5422s-projects.vercel.app`
- Verified all 9 routes return 200, `sw.js` is v3, no `min ago` in SSR output, install step present in the bundle.

### Install step (new feature)
Added a first-run install prompt to onboarding, because installing is the **precondition** for the app's central promise — cached alerts and evacuation instructions only exist on a device that already has the app when the network fails.
- `src/lib/install-prompt.ts` — captures and suppresses Chromium's `beforeinstallprompt`, replays it on demand, and exposes `useInstallMethod()` returning `prompt | ios-manual | browser-menu | installed`.
- `src/features/onboarding/install-step.tsx` — the final onboarding step (after zone selection, so the resident is protecting *their own* barangay, not installing software in the abstract). Makes the argument in both languages, never blocks, and never shows a button that can't work: iOS Safari gets the Share-sheet steps instead of a fake Install button.
- `markOnboarded()` moved to the end of the flow, so closing the tab mid-onboarding restarts rather than landing on a home screen with no zone chosen.

### The service-worker cache mystery (resolved)
Spent significant time apparently unable to confirm precaching worked — the Browser pane kept showing empty caches. Verified in **real Chrome on a clean first visit**: `weatherwell-shell-v3` has **8 entries** (all 7 precached routes plus `/onboarding` from the fetch handler), `weatherwell-assets-v3` has **39**, `controlled: true`, and `/evacuation` is cached at **25,570 bytes with real instructions in it**. Precaching was never broken — the empty caches were the result of my own repeated `unregister()` / `caches.delete()` cycles leaving that origin with an already-`activated` worker so `install` never re-ran.

---

## Key Outcomes

- **CI is green** and now gates every push on lint, types, tests, knip, and build.
- **347 tests across 65 files, all passing.**
- **PRD is submission-ready** — restructured for judges, verified against the code, aligned with the locked IDEA, with flexibility built in for post-submission changes.
- **The app's core offline promise is verified against the real deployment for the first time**: a resident's evacuation instructions are physically on their device after one visit, before any outage.
- Four review passes to clean; one defect class (operator decisions not honoured downstream) accounted for five of seven bugs.

---

## Files Changed

68 files, +3,721 / −486 since `2c478f2`.

**New:**
- `.github/workflows/ci.yml` — lint/typecheck/test/knip/build
- `knip.jsonc` — unused-code config
- `src/lib/install-prompt.ts` — install capture + `useInstallMethod`
- `src/features/onboarding/install-step.tsx` + `.test.tsx` — onboarding install step
- `src/lib/use-hydrated.ts` — `useHasHydrated`
- `src/components/time-ago.tsx` + `.test.tsx` — hydration-safe elapsed time
- `src/lib/service-worker.test.ts` — sandboxed tests of the real `sw.js`
- `src/features/admin/admin-map-canvas.tsx` + `.test.tsx`, `src/app/admin/map/page.tsx` — admin operations map
- `src/features/map/*` — map-shell, hazard-backdrop-layer, poi-marker-layer (shared map extracted from `homepage-map`)
- `src/features/alerts/share-alert-button.test.tsx`, `src/features/homepage-map/use-route-finding.test.ts`

**Substantially rewritten:**
- `public/sw.js` — per-request-type strategies, v3 caches
- `PRD.md` — full restructure for submission
- `README.md` — replaced boilerplate
- `src/components/service-worker-registration.tsx` — production-only, dev cleanup
- `src/lib/zone-overrides.ts` — override severity/copy coherence, required capacity args
- `src/features/homepage-map/route-hazard.ts`, `use-route-finding.ts` — shared resolver, hazardous destinations
- `src/lib/risk-engine/score.ts` — required upstream-alert argument
- `src/app/onboarding/page.tsx` — three-step flow ending in install

**Deleted:** `getRecentReportsForZone`, `useHasVotedOnPin`

---

## Next Steps

- [ ] **Submit the PRD — due Tuesday 8 September 2026.** It is ready; nothing is blocking.
- [ ] Consider whether the city-level RBAC / multi-tenancy idea (admin grants per-city dashboards and roles) belongs in the PRD as a later stage. It was discussed but not committed to — it is a real answer to "how does one barangay's tool become a city's tool", but it is scope beyond submission.
- [ ] If any further feature lands before Tuesday, re-run the Build Status table check against the code — that table is dated and drifts the moment code changes.
- [ ] Consider merging `hi-fi` → `main` at some point; production currently deploys from `hi-fi`.

---

## Notes

- **AGENTS.md is not decoration.** This Next.js differs from training data. The `LayoutProps`/`PageProps` CI failure was solved by reading `node_modules/next/dist/docs/`, not by guessing. Do that first next time.
- **The app's own service worker will lie to you during development.** A "fix isn't working" that survives four rounds of debugging was cache-first `sw.js` serving stale JS. `service-worker-registration.tsx` now unregisters in dev specifically to stop this recurring.
- **Don't debug caches by clearing them.** Repeated `unregister()` + `caches.delete()` left the origin unable to re-run `install`, which produced the exact symptom being investigated. A clean browser profile is the correct instrument.
- Browser consoles **accumulate across navigations** — "every page has this error" was wrong; it fired once.
- The PRD must stay consistent with the **already-submitted, uneditable IDEA**. Any new idea has to fit inside it, not replace it.
- Heredocs mangle em-dashes and backslashes on this setup — use the Edit tool or a scratchpad file for anything with typographic characters.

---

*Session ID: 202609051044-session-ci-prd-submission-and-install-step*
