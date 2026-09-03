# Combined Plan: Risk Engine + Simulation Improvements + Climate Resilience

**Date:** 2026-09-03 (revised after review)
**Status:** Draft — first slice scoped, rest deferred pending that slice landing
**Author:** opencode (AI assistant); revised by Claude Code after a design review flagged the issues below

---

## Revision note

The original version of this doc was reviewed and found not actionable as written:
a "Files to Modify" list of 2 files for something described as replacing every
mock-data lookup in the app; a Stage 3 that computes evacuation routes,
directly contradicting the PRD's own "you can't compute routes during a
disaster, ship pre-authored ones" position; undefined formula terms
(`fatigueDiscount`, `seasonalBaseline`'s range); no mention of how the engine's
output interacts with the admin's existing Human Override
([zone-overrides.ts](../../src/lib/zone-overrides.ts)); two competing cascade
mechanisms (`upstreamZoneState` as an input vs. "resolve cascade
dependencies" in the orchestrator); a Web Workers / sub-50ms performance
section for what is arithmetic over 4 zones; no i18n plan for
computer-generated alert text in an app where every other user-facing string
is an authored `LocalizedText`; and — worst — RA 10121 section citations that
turned out to be wrong (verified against the statute's actual text, see
below). This revision fixes each of those and cuts the plan down to a first
slice that's actually safe to build.

---

## Table of Contents

1. [Part 1 — Risk Engine](#part-1--risk-engine)
2. [Part 2 — Simulation Improvements](#part-2--simulation-improvements)
3. [Part 3 — Climate Resilience & Disaster Management](#part-3--climate-resilience--disaster-management)
4. [Cross-References](#cross-references)
5. [Implementation Order](#implementation-order)

---

## Part 1 — Risk Engine

### Overview

**Scope change from the original draft:** this is no longer "replace every ad-hoc
mock-data lookup with a 5-stage pipeline" — that touches ~15 files
(`zone-overrides.ts`, `route-hazard.ts`, `zone-map.tsx`,
`personal-status-headline.tsx`, the admin simulation page, every admin panel,
and a large share of the 258-test suite) and can't be scoped or reviewed as
one PR. Instead: build **Stage 2 (scoring) only**, additive and read-only —
it computes a `riskScore` and shows it as a new number on the admin
dashboard, alongside the existing mock alert/status. Nothing currently on
screen is rewired to read from it. If the score proves useful and the
formula holds up under real use, a follow-up plan scopes wiring Stages 1/3/4/5
and touching real call sites — as its own reviewed piece of work, not bundled
into this one.

### New Files (this slice)

| File | Purpose |
|---|---|
| `src/lib/risk-engine/types.ts` | `ZoneInput`, `ZoneState`, `Factor` — Stage 2 only |
| `src/lib/risk-engine/score.ts` | Stage 2 — zone state scoring |
| `src/lib/risk-engine/score.test.ts` | Table-driven tests per scoring band and edge case |

Stages 1 (ingest), 3 (decide), 4 (deliver), and 5 (feedback) are **designed
below for context and future sequencing, not built in this slice.** Building
them requires the open design questions in this doc (Human Override
interaction, route-computation conflict, i18n) to be resolved and reviewed
first — see "Deferred stages" below.

### Files to Modify (this slice)

| File | Change |
|---|---|
| `src/app/admin/page.tsx` | Add one new read-only stat tile showing each zone's `riskScore`, computed from existing mock data via `computeZoneState`. Nothing else on the page changes. |

No other file changes. Nothing currently rendering an alert, status, or
route reads from the risk engine in this slice — that's the point of scoping
it this way: the feature can be reverted by deleting three files and one
tile, with zero blast radius.

### Stage 2 — Zone State Scoring (`score.ts`) — built in this slice

```ts
interface ZoneInput {
  zoneId: string;
  rainfallMmPerHour: number;
  rainfallHistory: number[];     // last 12 hourly readings, oldest first — matches getRainfallHistoryForZone
  thunderstormWatch: boolean;
  hazardSusceptibility: Record<HazardType, HazardRiskLevel>;
  reportCount24h: number;        // matches getReportsTodayForZone
  cascadeFromUpstream: boolean;  // true if the zone immediately upstream (via Zone.downstreamZoneId) has an active alert right now — see Cascade resolution below
}

interface Factor {
  source: "rainfall" | "crowd_reports" | "hazard_baseline" | "cascade" | "thunderstorm_watch";
  weight: number;   // the fixed weight below, for display/debugging
  value: number;    // this factor's 0–1 contribution before weighting
}

interface ZoneState {
  zoneId: string;
  riskScore: number;              // 0–100 integer, clamped
  confidence: ConfidenceLevel;    // "estimated" | "validated" — see ladder below; "calibrated" is Phase 3+, not reachable in Phase 1
  trendDirection: "improving" | "stable" | "escalating";
  contributingFactors: Factor[];
}
```

Dropped from the original draft, with why:

- **`upstreamZoneState`, `tideHeightM`, `damReleaseM3s`, `historicalFloodDuration`,
  `seasonalBaseline`, `falseAlarmRate`, `registeredVulnerable`, `registeredAssets`,
  `windKph`, `heatIndexC`** — none of these currently exist as real inputs
  this app can compute; `seasonalBaseline`/`falseAlarmRate`/reputation-style
  inputs are exactly the Phase 3+ calibration-loop concept the PRD already
  describes separately (see PRD's Calibration loop, Phase 3+). Including them
  as struct fields today with no way to populate them just means every
  consumer has to handle `undefined`. They come back once Phase 3's real
  audit trail exists to compute them from.
- **`timeToCritical`, `cascadeRisk`** — cut for this slice; nothing downstream
  (no Stage 3 built here) consumes them yet, so they'd be unused fields.

**Scoring formula** — every term now defined, and the result is clamped:

```
riskScore = clamp(
  rainfallTrend      × 0.40 +
  crowdReports       × 0.30 +
  hazardBaseline     × 0.20 +
  cascadeFromUpstream × 0.10,
  0, 100
) × 100   // each term above is 0–1 before this final scaling; thunderstormWatch folds into rainfallTrend below rather than its own weighted term, since a watch with no accompanying rain shouldn't score as high as actual rain
```

- `rainfallTrend` (0–1): `min(1, latestRainfallMmPerHour / 50)`, then +0.15
  flat (capped at 1) if `thunderstormWatch` is true — a forecast watch nudges
  the score up without needing its own weight class.
- `crowdReports` (0–1): `min(1, reportCount24h / REPORT_THRESHOLD / 3)` — reuses
  the existing `REPORT_THRESHOLD` constant from `mock-data/reports.ts` rather
  than inventing a second threshold.
- `hazardBaseline` (0–1): `0` for `low`, `0.5` for `medium`, `1` for `high`,
  reading the zone's own flood-hazard susceptibility (reuses
  `getHazardSusceptibilityForZone`, doesn't reinvent it).
- `cascadeFromUpstream` (0–1): `1` if true, else `0`.

No `fatigueDiscount` or `seasonalBaseline` multiplier in this slice — both
were undefined-range terms in the original draft. Alert fatigue suppression
already exists conceptually in the PRD's anti-abuse section (layer 7, Human
Override) and doesn't need a second, competing discount inside the score
itself; if it's ever added here, it changes `decide.ts`'s output (a
downstream policy), not the raw score.

**Confidence ladder** (only two levels reachable in Phase 1 — matches the
PRD's own three-level ladder, `calibrated` requires the Phase 3+ audit trail):
- `estimated`: `reportCount24h < REPORT_THRESHOLD`
- `validated`: `reportCount24h >= REPORT_THRESHOLD`

**Trend detection:** compare the mean of `rainfallHistory[0..5]` (oldest 6)
vs. `rainfallHistory[6..11]` (newest 6). If the newer mean exceeds the older
by more than 20%, `"escalating"`; if it's lower by more than 20%,
`"improving"`; otherwise `"stable"`.

**Cascade resolution:** `cascadeFromUpstream` is computed by the caller, not
inside `score.ts` — walk `MOCK_ZONES` to find which zone's
`downstreamZoneId` equals the current zone's id (there's at most one, since
the mock topology is a single chain zone-1→2→3→4), then check
`getActiveAlertForZone` on that zone. This reuses the **existing**
`Zone.downstreamZoneId` field and existing alert lookup — no second
`upstreamZoneState` parameter, no separate cascade-resolution pass in an
orchestrator that doesn't exist in this slice. If the topology is ever not a
single chain, this walk needs revisiting, but building a general
topological-sort/cycle-guard now for a linear 4-node chain is solving a
problem that doesn't exist yet.

### Deferred stages (design sketch only — not built in this slice)

Keeping these here so the eventual follow-up plan doesn't start from zero,
but every one of them has an open question that needs resolving *before*
implementation, not during:

- **Stage 3 (decide)** — must NOT compute `evacuationRoute`/`fallbackRoute`
  geometry. The PRD is explicit that Phase 1 routes are pre-authored per
  zone→evacuation-center pair specifically *because* routes can't be safely
  computed during a live event, and `Zone.evacuationRoutePath` already
  carries that hand-authored path. A future Stage 3 can output a decision
  (severity, timing, message) that the *existing* route/instruction data
  responds to (e.g. flagging the pre-authored route as hazardous, which
  `route-hazard.ts` already does) — it must never generate its own route.
- **Human Override interaction (unresolved in the original draft):** the
  admin's existing override (`setZoneAlertOverride` in
  `zone-overrides.ts`) must always win. A future Stage 3 should be designed
  so its output is *advisory only* — surfaced to admin as a suggestion next
  to the real (override-resolved) alert via `resolveEffectiveAlert`, never
  auto-applied to what residents see. This mirrors the PRD's own Human
  Override anti-abuse layer: automated signals propose, a human confirms.
- **Stage 4 (deliver) / Stage 5 (feedback)** — "user behavior tracking (did
  they evacuate?)" from the original draft needs an explicit consent design
  before it's buildable at all; the PRD's whole privacy posture is "no
  accounts, photos never leave the device." Cut until that's resolved, not
  carried forward as a checkbox item.
- **i18n for generated text** — any decision-engine output shown to a
  resident (alert message, timing) must be composed by *selecting* from a
  small set of already-authored `LocalizedText` templates keyed by
  `(severity, confidence)`, the same pattern `resolveEffectiveAlert`'s
  `GENERIC_OVERRIDE_MESSAGE` already uses — never by concatenating strings
  at runtime, which is unreviewable and un-translatable.

### Performance

Four zones, plain arithmetic, no I/O. This runs in well under a millisecond
on any device this app targets. No caching, no Web Workers, no parallelism —
those solve a problem this scale doesn't have, and adding them now is
speculative complexity with no measured need.

### Testing

`score.test.ts` — table-driven, one case per scoring band boundary (just
below/at/just above 20, 50, 75 if those bands come back in a future Stage 3;
for this slice, per-factor boundary cases: rainfall at 0/25/50mm, report
count at 0/threshold/3×threshold, each hazard level, cascade true/false) plus
the trend-detection escalating/stable/improving cases. One file, not the
original draft's single `engine.test.ts` for a 5-stage pipeline that doesn't
exist yet — there's nothing to integration-test until Stages 1/3/4/5 are
actually built.

### PRD Updates (this slice only)

Add one sentence to the Admin analytics dashboard description (Core Feature
#15 / Architecture section): *"The dashboard also shows a computed risk score
per zone (rainfall trend, crowd reports, hazard baseline, cascade — see
`src/lib/risk-engine/score.ts`), advisory only and separate from the actual
alert severity, which always comes from `resolveEffectiveAlert`."* No other
PRD section changes until a Stage 3+ follow-up plan exists.

---

## Part 2 — Simulation Improvements

### Current State (updated)

Since the original draft, the simulation page's timer logic was already
rewritten once this session — from a deeply nested `setTimeout` chain to a
`useRef`-tracked `scheduleStep`/`clearPendingTimeouts` pattern with a
`STEP_TIMING_MS` lookup table (see
[src/app/admin/simulation/page.tsx](../../src/app/admin/simulation/page.tsx)).
All 6 scenarios still play the identical step sequence and timing regardless
of which one is selected — only the scenario's name/description text
changes. That's the actual gap Problems A and F below address.

### Problem A + F — Scenario-Specific Timing, Combined With Speed Control

**These are one refactor, not two independent items.** Both need the same
underlying change: `STEP_TIMING_MS` becoming per-scenario instead of one
fixed table, and `scheduleStep`'s delay becoming `delay / speedMultiplier`
instead of a raw constant. Building "scenario-specific sequences" first and
"speed control" second means rewriting the same scheduling core twice.

**Solution:**
- Replace the single `STEP_TIMING_MS` table with
  `SCENARIO_STEP_TIMING: Record<ScenarioId, Partial<Record<SimulationStep, number>>>`
  — most scenarios reuse the existing timing; "Flash Flood" gets compressed
  delays, "Clear Skies" skips straight from `predicting` to `complete` with
  no alert steps at all (it currently still runs the full push/SMS/cache
  chain, which makes no sense for "no weather threat").
- Add a speed selector (0.5x/1x/2x) that multiplies every scheduled delay.
  `scheduleStep(step, STEP_TIMING_MS[step] / speed)`.

**Effort:** Low-Medium — one data table restructure, one multiplier threaded
through the existing scheduler. No new components.

### Problem B — Fixed Success/Failure Paths

**Problem:** Push always fails → SMS always sends → cache always works.

**Solution:** Probability-based branching (push 70/30, cache 95/5), but
**seeded**, not `Math.random()` directly — pass an injectable RNG
(`() => number`, defaulting to `Math.random` in the component,
overridable in tests) so `page.test.tsx` can pin the outcome deterministically
instead of flaking. This was called out in the original draft's own list of
open questions implicitly (it didn't mention testability at all) — flagging
it explicitly now since it's the kind of thing that's easy to ship broken.

**Effort:** Medium.

### Problem C — No User Interaction

Unchanged from the original draft: pause at predict/push-fail/cascade,
admin can override/retry/confirm/cancel. **Effort:** Medium.

### Problem D — Single Zone Only

Unchanged: visual cascade chain, mini-map, per-zone timing. **Effort:** High.
Note: this is the one item that would actually benefit from Stage 2's
`riskScore` once that exists — showing the *computed* score changing as the
cascade propagates, not just a step label — but doesn't depend on it; text
labels are enough for a first version.

### Problem E — No Failure Modes

Unchanged. **Effort:** Medium.

### Problem G — No Data Visualization During Flow

Unchanged. **Effort:** Medium.

### Problem H — No Outcome Metrics

**Problem:** No feedback on response quality.

**Solution:** Show residents-notified count, delivery time, cascade accuracy
— **as plain metrics, not a letter grade.** The original draft's "Grade:
A/B/C/D/F" framing turns a disaster-drill training tool into a scored test,
which works against the PRD's own "training and demo only" framing
(`DRILL_NOTE` in the simulation page already says exactly this). Show the
numbers; let the admin judge them.

**Effort:** Medium.

### Problem I — No Save/Export

Unchanged. **Effort:** Low.

### Problem J — No What-If Mode

Unchanged, still lowest priority. **Effort:** High.

### Priority Order

1. **A+F (Scenario timing + speed control, combined)** — biggest gap, one refactor
2. **C (Admin interaction)**
3. **B (Branching outcomes, with seeded RNG)**
4. **D (Multi-zone cascade)**
5. **G (Live visualization)**
6. **H (Outcome metrics, no letter grade)**
7. **I (Save/export)**
8. **E (Failure modes)**
9. **J (What-if mode)**

---

## Part 3 — Climate Resilience & Disaster Management

### Frameworks Referenced

- UN Sendai Framework for DRR 2015–2030 — four priorities: (1) Understanding
  disaster risk, (2) Strengthening disaster risk governance, (3) Investing in
  disaster risk reduction for resilience, (4) Enhancing disaster preparedness
  for effective response and to "Build Back Better" in recovery
- Philippine DRRM Act (Republic Act No. 10121 of 2010) — section citations
  below verified against the statute's actual section headings (see revision
  note; the original draft's citations did not match and have been replaced)
- PAGASA warning protocols
- Community-Based DRRM (CBDRRM) best practices

### What the System Does Well

**1. Offline-first = resilience by design.** Service worker caching keeps
risk information available when infrastructure fails — directly serves
Sendai Priority 4 (preparedness for effective response), which explicitly
includes ensuring response capacity survives infrastructure disruption.

**2. Community-as-sensor model.** Crowdsourced water-level reports make
residents active participants rather than passive recipients — the
CBDRRM approach RA 10121 institutionalizes through Local DRRM Councils'
community-level mandate (Sec. 11).

**3. Cascade warning (upstream → downstream).** Genuinely uncommon at
barangay scale — most apps this size don't model that Zone 1 flooding
predicts Zone 2's flooding hours later.

**4. Pre-authored evacuation instructions.** Correct call — you can't safely
compute evacuation routes live during a disaster with degraded connectivity
and unreliable positioning.

**5. Community relay + printed emergency cards.** Addresses the
non-smartphone population. This is the app's implementation of the public
information/education duty RA 10121 Sec. 12 assigns to the Local DRRM
Office ("disseminate information and raise public awareness about hazards,
vulnerabilities and risks... early warning signs and counter-measures") —
*not* Sec. 16 as the original draft claimed; Sec. 16 is actually "Declaration
of State of Calamity" and has nothing to do with accessibility.

**6. Simulation/drill mode.** Maps to RA 10121 Sec. 12's LDRRMO duty to
"organize and conduct training, orientation, and knowledge management
activities on disaster risk reduction and management at the local level" —
*not* Sec. 14 as the original draft claimed; Sec. 14 is actually "Integration
of Disaster Risk Reduction Education into the School Curricula," a different
(real, but different) provision about school curricula, not general drill
programs.

### Gaps & Recommendations

#### Gap A — Compound multi-hazard events (Critical) — corrected scope

**Problem:** The app scores flood, landslide, and storm surge as independent
numbers with no interaction term. Real disasters compound — a typhoon brings
rainfall + storm surge + landslide risk together, and the combination is
worse than any single factor.

**What already exists, contra the original draft's "nothing is built" framing:**
`hasElevatedLandslideRisk(susceptibility, mmPerHour)` in
`src/lib/mock-data/weather.ts` already computes a narrow two-factor
compound (landslide susceptibility × current rainfall), surfaced as a
caution note on both the Current Conditions panel and the admin Landslide
Risk panel. This gap is about generalizing that existing pattern to more
hazard pairs, not building compound scoring from zero.

**Recommendation:** Extend the same function shape (not a new "compound
hazard matrix") to a second pairing — e.g. `hasElevatedStormSurgeRisk`
combining wind speed + coastal hazard susceptibility, following
`hasElevatedLandslideRisk`'s exact signature convention. Surface it the same
way: a caution line on Current Conditions, reusable by any admin panel that
already imports `hasElevatedLandslideRisk`. If a future Stage 2 risk-engine
score exists, feed both flags in as additional `Factor`s rather than
duplicating the compound logic inside the score.

#### Gap B — Evacuation center capacity management (Critical) — being built this session

**Problem:** `CenterStatus` is a 3-value enum (`space_available` /
`limited` / `full`) set manually, with no headcount, no derivation, no
"X spots remaining."

**Implementation (see PRD Core Feature #13 / Architecture after this lands):**
add an optional per-zone `evacuationCenterCapacity: number` to `Zone`, and an
optional `currentOccupancy?: number` to `ZoneOverride` (admin-editable, same
override mechanism status already uses). When occupancy is set, `CenterStatus`
is *derived* from the occupancy/capacity ratio (`< 70%` → space_available,
`70–95%` → limited, `>= 95%` → full) instead of needing a separate manual
enum choice; the manual override still works when occupancy isn't tracked.
Residents see "X of Y spots" instead of just a status word wherever capacity
is known.

**Addresses:** the concrete gap the original draft correctly identified as
highest-leverage — no risk-engine dependency, ships standalone.

#### Gap C — Time-based evacuation windows (High)

Unchanged from the original draft — time-of-day, tide schedules, school
hours all remain real, unaddressed gaps. No implementation in this pass;
flagged for a future slice once Stage 3 (decide) exists to attach timing
logic to, since there's no decision-output layer yet for "evacuate now vs.
in 2h" to live in.

#### Gap D — Post-evacuation accountability (High) — being built this session

**Problem:** The app tells residents to evacuate but has no signal on
whether they did, or whether they need help.

**Implementation:** a local, device-ID-keyed "check-in" store
(`weatherwell.evacuationCheckIns`, same `createLocalStorageStore` pattern as
every other Phase 1 store) with two resident actions — "I'm safe" and "I
need help" — shown on the evacuation page during an active Dangerous/
Hazardous alert for the resident's zone. Admin sees a per-zone count
("X check-ins, Y flagged needing help") on the zone dashboard. Phase 1 scope
only: this is a self-report with no verification, no location check, and no
real notification to responders — it demonstrates the interaction pattern
the PRD's Final Phase reputation/audit-trail work would need to make real.

#### Gap E — Warning message escalation clarity (Medium) — being built this session

**Problem:** Alert copy doesn't reference PAGASA's own warning vocabulary
(Rainfall Warning Yellow/Orange/Red) or include an explicit action step,
so residents can't map what they see in-app to what they'd hear on
TV/radio.

**Implementation:** extend each severity's alert-message template (used by
`resolveEffectiveAlert`'s `GENERIC_OVERRIDE_MESSAGE` and the mock alert
records) with a trailing action-step clause and the matching PAGASA rainfall
warning color name, e.g. *"...Monitor conditions and prepare to evacuate.
(Yellow Rainfall Warning level.)"* This is a copy change to existing
`LocalizedText` constants, not a new subsystem — no new files.

#### Gap F — After-action review capability (Medium)

Unchanged from the original draft. Depends on Problem H (outcome metrics)
existing first, and on there being a real event to review — for Phase 1's
mock data, this is better deferred until Phase 3's real audit trail exists to
review, rather than building a review UI with nothing real to show it.

#### Gap G — Multi-language alert escalation (Medium) — corrected, don't restate the PRD's plan

**The original draft's "Phase 2: add top 5 regional languages" contradicts
the PRD's own, already-staged plan** (Accessibility item 1): Filipino +
English from Phase 1, Cebuano (~20M speakers) in Phase 2, then the remaining
eight of the Philippines' ten most-spoken languages (Ilocano, Hiligaynon,
Waray, Bikol, Kapampangan, Pangasinan, Maranao, Maguindanao) in Phase 3/Final
as translation capacity allows — one language at a time, not five at once,
specifically because `LocalizedText`/`t()` already falls back to English so
partial coverage is safe to ship incrementally. This gap doesn't need a new
recommendation; it needs the plan to stop re-deriving a different schedule
than the one that already exists. TTS and pictograms are separately tracked
in the PRD's Accessibility section (items 3–4) already.

#### Gap H — Infrastructure failure awareness (Medium)

Unchanged from the original draft — no road/bridge/power status exists.
No implementation in this pass; this needs a reporting mechanism (who
reports a blocked road — an alert captain? any resident?) decided before
building it, which is a product question, not an engineering one.

#### Gap I — Livestock and agricultural assets (Low-Medium)

Unchanged, deferred — genuinely low priority relative to the human-safety
gaps above it.

#### Gap J — Mental health and psychosocial support (Low)

Unchanged, deferred to Final Phase per the original draft's own framing —
this is post-disaster recovery content, not a live-event feature, and the
PRD's Future Roadmap already scopes recovery-phase tooling as out of the
current live-event focus.

### Priority Summary (updated to reflect this session's builds)

| Priority | Gap | Status |
|---|---|---|
| Critical | A — Compound hazard scoring | Scope corrected (extends existing `hasElevatedLandslideRisk`); not built this pass |
| Critical | B — Evacuation center capacity | **Built this session** |
| High | C — Time-based evacuation windows | Deferred — needs Stage 3 to exist first |
| High | D — Post-evacuation accountability | **Built this session** (Phase 1 self-report scope) |
| Medium | E — Warning message clarity | **Built this session** (copy change) |
| Medium | F — After-action review | Deferred — needs Phase 3 audit trail to review |
| Medium | G — Multi-language alerts | Not a gap — PRD already has a correct staged plan; corrected here |
| Medium | H — Infrastructure awareness | Deferred — needs a reporting-ownership decision first |
| Low-Medium | I — Livestock/assets | Deferred |
| Low | J — Mental health support | Deferred to Final Phase per PRD's existing roadmap |

### RA 10121 Alignment (corrected — verified against the statute's actual section headings)

| RA 10121 Section | Actual Heading | WeatherWell Status |
|---|---|---|
| Sec. 6 | Powers and Functions of the NDRRMC | Partially addressed — the Act calls for a national early-warning/alert system "through diverse mass media"; this app's push/SMS/cache fallback is one channel of that, not the national system itself |
| Sec. 11 | Organization at the Local Government Level (incl. pre-emptive evacuation recommendation, Sec. 11(b)(3)) | Addressed — evacuation instructions and timing serve this at the individual-app level, though the statute assigns the actual recommendation authority to the Local DRRM Council, not an app |
| Sec. 12 | Local Disaster Risk Reduction and Management Office (LDRRMO) | Addressed — LDRRMO's multi-hazard early-warning, public-information/IEC, and training duties are exactly what the app's alerts, community relay, and drill mode implement at the tool level |
| Sec. 16 | Declaration of State of Calamity | Not addressed — this is a formal government declaration mechanism; the app has no equivalent and doesn't need one |
| Sec. 18 | Mechanism for International Humanitarian Assistance | Not addressed — out of scope for a barangay-level resident app |
| Sec. 19 | Prohibited Acts | N/A — a penal provision, not a feature area |
| Sec. 21 | Local Disaster Risk Reduction and Management Fund (LDRRMF) | Not addressed — the app doesn't track disaster funds; would only matter if resource pre-positioning (Future Roadmap) were ever built |

The original draft's table cited "Sec. 7," "Sec. 10," "Sec. 14," "Sec. 16,"
"Sec. 17," "Sec. 18," "Sec. 19," and "Sec. 20" for provisions (DRRM Councils,
Local DRRM Fund, Preparedness Programs, Inclusive & Accessible, Early Warning
Systems, Pre-emptive Evacuation, Emergency Public Information, Humanitarian
Assistance respectively) that — checked against the statute's real section
headings — mostly don't match. The table above uses only verified headings.

---

## Cross-References

| Risk Engine Piece | Addresses Gap | Addresses Simulation |
|---|---|---|
| Stage 2 (score) — this slice | Feeds a future Gap A extension (compound flags as additional Factors) | Could enrich Problem D's cascade view once it exists |
| Stage 3 (decide) — deferred | C (time-based windows), once built | — |
| Stage 4/5 (deliver/feedback) — deferred, blocked on consent design | F (after-action review), once real audit trail exists | — |

| Simulation Improvement | Addresses Gap |
|---|---|
| H (outcome metrics) | F (after-action review), once Phase 3 audit trail exists to review against |

---

## Implementation Order

### This session's actual scope (see chat history for what shipped)

1. `src/lib/risk-engine/types.ts`, `score.ts`, `score.test.ts` — Stage 2 only
2. `src/app/admin/page.tsx` — one additive risk-score tile
3. Gap B — evacuation center capacity (`Zone.evacuationCenterCapacity`,
   `ZoneOverride.currentOccupancy`, derived status, admin + resident UI)
4. Gap D — post-evacuation check-in store + resident UI + admin count
5. Gap E — PAGASA-referenced alert copy (text-only change to existing
   `LocalizedText` constants)
6. PRD updates reflecting all of the above

### Deferred — needs its own scoped, reviewed plan before starting

- Stage 1 (ingest), Stage 3 (decide), Stage 4 (deliver), Stage 5 (feedback) —
  blocked on the open design questions in Part 1 (Human Override interaction,
  route-computation conflict, consent for behavior tracking, i18n composition)
- Simulation Problems A+F (combined), B, C, D, E, G, H, I, J — real, valuable,
  but each needs its own scoping pass; Problem A+F is the natural next one
  given it's the smallest and most self-contained
- Gap A (compound hazard extension), C (time windows), F (after-action
  review), H (infrastructure awareness), I (livestock), J (mental health)

### Dependencies

- Nothing in "this session's actual scope" depends on anything else in that
  list — each of the three features (risk score tile, capacity tracking,
  check-in) is independently revertable.
- The deferred risk-engine stages depend on Part 1's open design questions
  being resolved *in review*, not during implementation.
- Simulation Problem D (multi-zone cascade) would be enriched by a future
  Stage 2 riskScore but doesn't require it.

---

*Revised from the original three-analysis consolidation after a design
review surfaced scope, correctness, and citation-accuracy issues (see
Revision note above). The corrected version scopes down to what's provably
buildable and defers everything whose design isn't settled yet.*
