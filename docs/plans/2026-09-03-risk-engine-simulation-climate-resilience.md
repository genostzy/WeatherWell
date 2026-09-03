# Combined Plan: Risk Engine + Simulation Improvements + Climate Resilience

**Date:** 2026-09-03
**Status:** Draft — pending review
**Author:** opencode (AI assistant)

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

5-stage pipeline that computes zone risk and decisions in a single pass. Replaces the current ad-hoc mock data lookups with a unified computation engine. All intelligence flows through 5 stages: ingest → score → decide → deliver → feedback.

### New Files

| File | Purpose |
|---|---|
| `src/lib/risk-engine/types.ts` | Shared types for all 5 stages |
| `src/lib/risk-engine/ingest.ts` | Stage 1 — data collection |
| `src/lib/risk-engine/score.ts` | Stage 2 — zone state scoring |
| `src/lib/risk-engine/decide.ts` | Stage 3 — decision engine |
| `src/lib/risk-engine/deliver.ts` | Stage 4 — delivery actions |
| `src/lib/risk-engine/feedback.ts` | Stage 5 — post-event feedback loop |
| `src/lib/risk-engine/engine.ts` | Orchestrator — single entry point |
| `src/lib/risk-engine/engine.test.ts` | Tests for the full pipeline |

### Files to Modify

| File | Change |
|---|---|
| `src/lib/types.ts` | Add `ZoneState`, `ZoneDecision`, `ZoneInput` interfaces |
| `PRD.md` | Add "Risk Engine" section under Architecture, update Phase 3 description |

### Architecture

```
Stage 1 (ingest)     → ZoneInput[]
Stage 2 (score)      → ZoneState[]     (parallel per zone)
Stage 3 (decide)     → ZoneDecision[]  (parallel per zone)
Stage 4 (deliver)    → void            (async, fire-and-forget)
Stage 5 (feedback)   → void            (async, post-event)
```

Single entry point:
```ts
computeZoneUpdate(zoneId, inputs) → ZoneDecision
computeAllZoneUpdates(inputs) → ZoneDecision[]
```

### Stage 1 — Data Ingestion (`ingest.ts`)

Collects everything into one object per zone:

```ts
interface ZoneInput {
  zoneId: string;
  // Weather
  rainfallMmPerHour: number;
  rainfallHistory: number[];     // last 12 hours
  windKph: number;
  thunderstormWatch: boolean;
  heatIndexC: number;
  // Hazard baseline
  hazardSusceptibility: Record<HazardType, HazardRiskLevel>;
  // Crowd reports
  recentReports: WaterLevelReport[];
  reportCount24h: number;
  reportVelocity: number;        // reports per hour, last 3 hours
  // Upstream
  upstreamZoneState?: ZoneState; // from Stage 2 of upstream zone
  // Infrastructure
  tideHeightM?: number;
  damReleaseM3s?: number;
  // Historical
  historicalFloodDuration: number; // hours, from past events
  seasonalBaseline: number;        // risk multiplier for current month
  falseAlarmRate: number;          // per-zone, last 30 days
  // User context
  registeredVulnerable: number;   // elderly/PWD count
  registeredAssets: number;       // livestock/vehicle count
}
```

### Stage 2 — Zone State Scoring (`score.ts`)

Single computation per zone, reused by everything downstream:

```ts
interface ZoneState {
  zoneId: string;
  riskScore: number;              // 0–100
  confidence: ConfidenceLevel;
  trendDirection: 'improving' | 'stable' | 'escalating';
  cascadeRisk: number;            // 0–100, from upstream
  timeToCritical: number | null;  // hours, null if not trending toward critical
  contributingFactors: Factor[];  // what's driving the score
}

interface Factor {
  source: 'rainfall' | 'crowd_reports' | 'cascade' | 'hazard_baseline' | 'tide' | 'dam';
  weight: number;
  value: number;
}
```

**Scoring formula** (weights tunable):
```
riskScore = (
  rainfallTrend(0.30) +
  crowdReports(0.25) +
  hazardBaseline(0.20) +
  cascadeRisk(0.15) +
  thunderstormWatch(0.10)
) × seasonalBaseline × fatigueDiscount
```

**Confidence ladder:**
- `estimated`: < 3 reports OR single source
- `validated`: 3+ reports from 2+ devices, matching rainfall trend
- `calibrated`: historical prediction matched actual outcome (Phase 3+)

**Trend detection:** compare `rainfallHistory[0..5]` vs `rainfallHistory[6..11]`. If slope > threshold → escalating.

### Stage 3 — Decision Engine (`decide.ts`)

Takes `ZoneState`, produces actionable decisions:

```ts
interface ZoneDecision {
  zoneId: string;
  alertSeverity: Severity | null;  // null = no alert needed
  alertMessage: LocalizedText;
  evacuationTiming: LocalizedText; // "now" / "in 2h" / "monitor"
  evacuationRoute: [number, number][];  // primary route
  fallbackRoute: [number, number][];    // if primary is compromised
  resourceSuggestion: ResourceAction[];
  fatigueSuppressed: boolean;      // true if too many recent alerts
  confidence: ConfidenceLevel;
  factors: Factor[];
}

interface ResourceAction {
  type: 'pre_position_supplies' | 'deploy_transport' | 'notify_vulnerable';
  target: string;  // zone or location
  urgency: 'now' | 'within_hour' | 'within_day';
}
```

**Decision rules:**
- `riskScore < 20` → no alert
- `riskScore 20–49` → yellow (Advisory)
- `riskScore 50–74` → orange (Watch) or red (Warning) based on trend
- `riskScore ≥ 75` → evacuate
- `fatigueSuppressed = true` → downgrade one severity level (but never below yellow if riskScore > 40)
- `confidence = "estimated"` → append "estimated" qualifier to alert message

**Evacuation timing:**
- `timeToCritical < 1h` → "Evacuate now"
- `timeToCritical 1–3h` → "Evacuate in X hours"
- `timeToCritical > 3h` → "Monitor conditions"
- `null` → "No action needed"

### Stage 4 — Delivery (`deliver.ts`)

Async, fire-and-forget. Reads `ZoneDecision` and executes:
- Push notification (with retry)
- Offline cache update
- Peer verification queue
- User behavior tracking (did they evacuate?)

Does NOT block the UI. Runs in background.

### Stage 5 — Feedback (`feedback.ts`)

Async, post-event. Runs after flood recedes:
- Update false-alarm rate per zone
- Track actual vs predicted flood duration
- Adjust seasonal baseline weights
- Update device trust scores
- Economic impact estimate

### Orchestrator (`engine.ts`)

```ts
function computeZoneUpdate(
  zoneId: string,
  inputs: ZoneInput,
  upstreamState?: ZoneState
): ZoneDecision

function computeAllZoneUpdates(
  zoneIds: string[],
  inputGetter: (zoneId: string) => ZoneInput
): ZoneDecision[]
```

The orchestrator:
1. Calls `ingest` for each zone (or accepts pre-built `ZoneInput[]`)
2. Runs `score` for all zones in parallel
3. Resolves cascade dependencies (upstream must score before downstream)
4. Runs `decide` for all zones in parallel
5. Returns `ZoneDecision[]`
6. Optionally kicks off `deliver` and `feedback` asynchronously

### Performance

- Zone states computed in parallel (Web Workers if needed)
- Stages 4–5 are async and don't block the main thread
- Caching: zone state cached for 5 minutes unless new data arrives
- No re-computation if inputs haven't changed (diff check)
- Total compute budget: < 50ms for all zones combined on low-end Android

### PRD Updates

**Add to Architecture section:**
> Risk engine: 5-stage pipeline (ingest → score → decide → deliver → feedback). Single zone state computation reused by all downstream decisions. Scoring combines rainfall trend, crowd reports, hazard baseline, cascade risk, and thunderstorm watch with tunable weights. Confidence ladder (estimated → validated → calibrated) with adaptive thresholds per zone. Alert fatigue prevention suppresses excessive alerts. Cascade resolution computes upstream → downstream propagation. All stages run client-side in Phase 1 (mock data); Phase 2+ moves ingest + score + decide server-side, deliver + feedback remain client-side. File: `src/lib/risk-engine/`

**Update Phase 3 description:**
> Build: risk engine (threshold engine → 5-stage pipeline: ingest, score, decide, deliver, feedback), Web Push with retry, 3 anti-abuse layers...

**Update Future Roadmap:**
> Risk engine layers 8–16: seasonal patterns, multi-hazard interaction, infrastructure awareness, user behavior analytics, network effects, cross-zone correlation, resource pre-positioning, alert fatigue prevention, NLP from crowd reports, satellite imagery, groundwater/soil moisture, vulnerable population mapping, phone density as crowd proxy, device trust network, offline-first ML inference, livestock/asset protection, post-disaster recovery tracking, peer verification chains, economic impact estimator, multi-path evacuation optimization — consolidated into 5 processing stages for performance

### Implementation Order

1. Create `src/lib/risk-engine/types.ts` — all interfaces
2. Create `src/lib/risk-engine/ingest.ts` — Stage 1
3. Create `src/lib/risk-engine/score.ts` — Stage 2
4. Create `src/lib/risk-engine/decide.ts` — Stage 3
5. Create `src/lib/risk-engine/deliver.ts` — Stage 4
6. Create `src/lib/risk-engine/feedback.ts` — Stage 5
7. Create `src/lib/risk-engine/engine.ts` — orchestrator
8. Create `src/lib/risk-engine/engine.test.ts` — tests
9. Update `src/lib/types.ts` with new exports
10. Update `PRD.md` with risk engine section

---

## Part 2 — Simulation Improvements

### Current State

The simulation page (`/admin/simulation`) runs a linear step flow with fixed timing:
predict → alert → push → push-fail → SMS → cache → cascade → complete

All 6 scenarios play the same steps. Admin watches passively. No interaction, no branching, no multi-zone view.

### Problem A — Every Scenario Plays Identically

**Problem:** "Approaching Typhoon" and "Clear Skies" run the same steps with the same timing. A flash flood should be faster than a typhoon approach. "Clear Skies" should show no alert issued.

**Solution:** Each scenario gets its own step sequence and timing:

| Scenario | Steps | Timing |
|---|---|---|
| Approaching Typhoon | predict → yellow → orange → red → push → cache → cascade → complete | 3s per step, gradual |
| Flash Flood | predict → red → push-fail → sms → cascade → complete | 1.5s per step, fast |
| Coastal Surge | predict → orange → red → evacuate → push → sms → complete | 2s per step |
| Monsoon Rain | predict → yellow → orange → push → cache → complete | 4s per step, slow build |
| Clear Skies | predict → all-clear → complete | 2s total |
| Community Drill | predict → yellow → push → admin-override → cascade → complete | 3s, includes interaction |

**Effort:** Low — data-driven step sequences, no new components.

### Problem B — Fixed Success/Failure Paths

**Problem:** Push always fails → SMS always sends → cache always works. Admin never sees "all push succeeded" or "SMS also failed."

**Solution:** Probability-based branching:
- Push success: 70% succeed, 30% fail (configurable per run)
- SMS: only triggers if push failed
- Cache: 95% success, 5% "device offline"
- Cascade: 80% arrives on time, 20% arrives early (faster than predicted)

Admin sees different outcomes each run, practices both happy and unhappy paths.

**Effort:** Medium — random number generator + conditional step insertion.

### Problem C — No User Interaction

**Problem:** Admin is a passive viewer. Can't override severity, cancel alert, or manually trigger cascade.

**Solution:** Pause simulation at key moments, wait for admin action:
- **After predict**: Admin can override severity (escalate/deescalate)
- **After push-fail**: Admin can choose "retry" or "send SMS now"
- **After cascade**: Admin can choose "confirm cascade" or "cancel downstream alert"
- **At any point**: Admin can cancel entire simulation

Interaction points marked with a pulsing indicator, simulation pauses until admin acts.

**Effort:** Medium — pause/resume state machine, interaction UI components.

### Problem D — Single Zone Only

**Problem:** Cascade step shows text but doesn't visually show Zone 1 → Zone 2 → Zone 3 propagation. No multi-zone coordination view.

**Solution:** Show the full cascade chain visually:
- Zone 1 floods → arrow animates to Zone 2 → Zone 2 alert triggers → arrow to Zone 3
- Each zone's marker updates in real-time on a mini-map
- Shows time delay between zones
- Demonstrates why early warning matters

**Effort:** High — mini-map component, animation system, multi-zone state sync.

### Problem E — No Failure Modes

**Problem:** Doesn't simulate: server down, all channels fail, evacuation center full, cascade faster than expected.

**Solution:** Add "difficulty levels" or "failure injectors":
- Easy: everything works as expected
- Medium: push occasionally fails, cascade slightly early
- Hard: server delays, all push fails, center at capacity, cascade much faster
- Custom: admin picks which failures to inject

**Effort:** Medium — failure injector configuration, additional step branches.

### Problem F — Fixed Timing, No Control

**Problem:** Can't pause, slow down, speed up, or scrub through. 1.5s steps are too fast to read explanations, too slow if you've already read them.

**Solution:**
- Speed selector: 0.5x / 1x / 2x / 4x
- Pause/Resume button
- Scrub timeline to jump to any step
- "Jump to cascade" shortcut

**Effort:** Low — timer multiplier, scrubber UI.

### Problem G — No Data Visualization During Flow

**Problem:** Should show rainfall graph climbing, risk score updating, reports counter incrementing. Static prediction timeline doesn't change during simulation.

**Solution:** During simulation, show animated charts:
- Rainfall bar graph climbing
- Risk score gauge updating
- Reports counter incrementing
- Evacuation center capacity bar filling
- All driven by the scenario's data progression

**Effort:** Medium — animated chart components, scenario data progression.

### Problem H — No Outcome Metrics

**Problem:** Doesn't show "residents notified", "evacuation time", "false alarm impact". No feedback on whether the response was effective.

**Solution:** After simulation completes, show summary:
- Residents notified (X/Y devices)
- Time to delivery (X seconds)
- Evacuation compliance (estimated)
- False alarm impact (if admin overrode severity)
- Cascade accuracy (predicted vs actual timing)
- Grade: A/B/C/D/F based on response quality

**Effort:** Medium — summary dashboard component, metric calculation.

### Problem I — No Save/Export

**Problem:** Admin can't save a simulation run for training records or review.

**Solution:**
- "Save Run" button → stores in localStorage with timestamp
- "Export" → downloads JSON with full step log, timing, admin actions
- "History" → list of past simulation runs for training records

**Effort:** Low — localStorage write, JSON export, history list.

### Problem J — No What-If Mode

**Problem:** Can't change inputs mid-simulation to see how the system adapts.

**Solution:** Mid-simulation, admin can adjust:
- Rainfall amount (increase/decrease)
- Report count (add/remove crowd reports)
- Push delivery rate (simulate network congestion)
- Evacuation center capacity (mark as full)

System recalculates in real-time, shows how decisions change.

**Effort:** High — real-time recalculation, input adjustment UI, state rollback.

### Priority Order

1. **A (Scenario-specific flows)** — biggest bang for buck
2. **F (Speed control)** — trivial to add, huge UX improvement
3. **C (Admin interaction)** — transforms passive demo into active training
4. **B (Branching outcomes)** — makes each run different
5. **D (Multi-zone cascade)** — shows the real value of the system
6. **G (Live visualization)** — makes it visually compelling
7. **H (Outcome dashboard)** — closes the feedback loop
8. **I (Save/export)** — nice to have for training records
9. **E (Failure modes)** — adds challenge levels
10. **J (What-if mode)** — power feature, low priority

---

## Part 3 — Climate Resilience & Disaster Management

### Frameworks Referenced

- UN Sendai Framework for DRR 2015–2030
- Philippine DRRM Act (RA 10121)
- PAGASA warning protocols
- Community-Based DRRM (CBDRRM) best practices

### What the System Does Well

**1. Offline-first = resilience by design**
Most DRRM apps fail when connectivity drops. WeatherWell's service worker caching ensures risk information reaches people even when infrastructure collapses.

**2. Community-as-sensor model**
Crowdsourced water-level reports align with RA 10121's emphasis on Community-Based DRRM. Residents are active participants, not passive recipients.

**3. Cascade warning (upstream → downstream)**
Genuinely novel for a barangay-level app. Real flood events propagate — Zone 1 floods, then Zone 2, then Zone 3. The system models this correctly.

**4. Pre-authored evacuation instructions**
Static, per-zone instructions that work offline. Correct call — you can't compute evacuation routes during a disaster.

**5. Community relay + printed emergency cards**
Addresses the non-smartphone population. RA 10121 Section 16 requires DRRM to be "inclusive and accessible."

**6. Simulation/drill mode**
RA 10121 Section 14 requires LGUs to "conduct regular preparedness programs and activities."

### Gaps & Recommendations

#### Gap A — Missing: Multi-hazard compound events (Critical)

**Problem:** The system treats flood, typhoon, landslide, and storm surge as separate hazards. Real disasters are compound — a typhoon brings rainfall + storm surge + landslide simultaneously.

**What's missing:**
- No compound hazard scoring (typhoon + high tide + saturated soil = worse than any alone)
- Alert messages don't mention secondary hazards
- Evacuation instructions don't change based on which hazards are active

**Recommendation:**
- Add compound hazard matrix to risk engine Stage 2
- Alert messages should reference secondary hazards when applicable
- Evacuation routes should avoid landslide-prone areas during heavy rain

**Addresses:** Risk Engine Stage 2 (scoring), Stage 3 (decide)

#### Gap B — Missing: Evacuation center capacity management (Critical)

**Problem:** The system shows center status (space_available/limited/full) but doesn't track headcount, redirect when full, or predict capacity.

**What's missing:**
- No headcount tracking at evacuation centers
- No "center full, go to alternate" logic
- No capacity forecasting

**Recommendation:**
- Add manual headcount entry (admin or alert captain)
- Auto-redirect evacuation suggestions when center approaches capacity
- Show "X spots remaining" instead of just "limited"

**Addresses:** Risk Engine Stage 3 (decide), Stage 4 (deliver)

#### Gap C — Missing: Time-based evacuation windows (High)

**Problem:** Alerts say "Evacuate now" or "Evacuate in 2h" but don't account for time of day, tide schedules, or school hours.

**What's missing:**
- No time-of-day awareness in evacuation timing
- No tide schedule integration for coastal zones
- No school/daycare-specific evacuation protocols

**Recommendation:**
- Factor time-of-day into evacuation timing
- For coastal zones, show tide windows
- Add school evacuation as a separate scenario

**Addresses:** Risk Engine Stage 3 (decide with time context)

#### Gap D — Missing: Post-evacuation accountability (High)

**Problem:** The system tells people to evacuate but doesn't track if they did, if they're safe, or if they need medical attention.

**What's missing:**
- No "I'm safe" check-in mechanism
- No family reunification tracking
- No medical needs registry at evacuation centers

**Recommendation:**
- Add "I evacuated safely" button
- Add "I need help" button for medical/special needs
- Show "X of Y expected residents have checked in"

**Addresses:** Risk Engine Stage 4 (deliver), Stage 5 (feedback)

#### Gap E — Missing: Warning message escalation clarity (Medium)

**Problem:** Alert messages don't follow PAGASA's standard warning format. Real Philippine warnings use specific escalation language (TCWS 1–5, Rainfall Warning Yellow/Orange/Red).

**What's missing:**
- Alert messages don't reference PAGASA warning levels
- No standard format that residents recognize from TV/radio
- No "what to do" action steps in alert messages

**Recommendation:**
- Align alert message format with PAGASA conventions
- Include action steps in every alert
- Reference official PAGASA warnings when available

**Addresses:** Risk Engine Stage 3 (decide message format)

#### Gap F — Missing: After-action review capability (Medium)

**Problem:** The system has simulation mode for training but no post-event review for real events.

**What's missing:**
- No post-event summary dashboard
- No evacuation compliance metrics
- No alert delivery success/failure tracking

**Recommendation:**
- Log all alert delivery attempts (success/failure)
- Track evacuation check-ins during real events
- Generate post-event report

**Addresses:** Simulation Improvement H (outcome dashboard), Risk Engine Stage 5 (feedback)

#### Gap G — Missing: Multi-language alert escalation (Medium)

**Problem:** Filipino and English may not reach all residents. Ilocano, Cebuano, Bikol speakers may miss critical information.

**What's missing:**
- No support for regional languages in alerts
- No voice/TTS for low-literacy users
- No pictogram-based alerts for non-readers

**Recommendation:**
- Phase 2: Add top 5 regional languages
- Phase 3: Add TTS for critical alerts
- Always: Include pictograms in alert messages

**Addresses:** Risk Engine Stage 4 (deliver), independent localization work

#### Gap H — Missing: Infrastructure failure awareness (Medium)

**Problem:** The system assumes evacuation centers are always accessible. Real disasters damage infrastructure — roads flooded, bridges damaged, power out.

**What's missing:**
- No road condition reporting
- No bridge status tracking
- No power status at evacuation centers

**Recommendation:**
- Add "route open/blocked" status to evacuation routes
- Alert captains can report road conditions
- Note power status at centers

**Addresses:** Risk Engine Stage 1 (ingest road status), Stage 3 (decide route)

#### Gap I — Missing: Livestock and agricultural assets (Low-Medium)

**Problem:** In rural Philippine barangays, livestock and crops are critical livelihood assets. The system focuses on human evacuation only.

**What's missing:**
- No livestock evacuation guidance
- No agricultural asset tracking
- No "move your carabao" type alerts

**Recommendation:**
- Add optional livestock registration during onboarding
- Include livestock evacuation in community relay instructions
- Asset-specific alert messages

**Addresses:** Risk Engine Stage 1 (ingest asset data), Stage 3 (decide resource actions)

#### Gap J — Missing: Mental health and psychosocial support (Low)

**Problem:** Disaster response doesn't end with physical safety. Survivors need psychological first aid, missing persons information, and recovery resources.

**What's missing:**
- No mental health resources
- No missing persons board
- No recovery information

**Recommendation:**
- Phase 3: Add "Need someone to talk to?" resource link
- Post-disaster: Add "Report missing person" feature
- Recovery phase: Show "Recovery resources" panel

**Addresses:** Risk Engine Stage 5 (feedback), independent feature work

### Priority Summary

| Priority | Gap | Impact |
|---|---|---|
| Critical | A — Compound hazard scoring | Prevents under-estimation of multi-hazard events |
| Critical | B — Evacuation center capacity | Prevents center overflow and redirect failures |
| High | C — Time-based evacuation windows | Accounts for night/tide/school timing |
| High | D — Post-evacuation accountability | Ensures everyone is safe, not just "told to evacuate" |
| Medium | E — Warning message clarity | Aligns with PAGASA, reduces confusion |
| Medium | F — After-action review | Enables continuous improvement |
| Medium | G — Multi-language alerts | Reaches all residents |
| Medium | H — Infrastructure awareness | Prevents routing to inaccessible centers |
| Low-Medium | I — Livestock/assets | Protects livelihoods |
| Low | J — Mental health support | Addresses post-disaster recovery |

### RA 10121 Alignment

| RA 10121 Provision | WeatherWell Status |
|---|---|
| Sec. 7: DRRM Councils | Not addressed — system is developer-run, no council integration |
| Sec. 10: Local DRRM Fund | Not addressed — system doesn't track disaster funds |
| Sec. 11: DRRM Plan | Partially addressed — simulation mode supports planning |
| Sec. 14: Preparedness Programs | Addressed — simulation/drill mode |
| Sec. 16: Inclusive & Accessible | Partially addressed — community relay, but missing regional languages |
| Sec. 17: Early Warning Systems | Addressed — core feature |
| Sec. 18: Pre-emptive Evacuation | Addressed — evacuation instructions and timing |
| Sec. 19: Emergency Public Information | Addressed — push notifications, share alert |
| Sec. 20: Humanitarian Assistance | Not addressed — no relief distribution tracking |

---

## Cross-References

| Risk Engine Stage | Addresses Gap | Addresses Simulation |
|---|---|---|
| Stage 1 (ingest) | H — Infrastructure status | — |
| Stage 2 (score) | A — Compound hazards | — |
| Stage 3 (decide) | C — Time-based windows, E — Message clarity, H — Route awareness | — |
| Stage 4 (deliver) | B — Center capacity, D — Accountability, G — Multi-language | — |
| Stage 5 (feedback) | D — Accountability, J — Mental health | H — Outcome dashboard |

| Simulation Improvement | Addresses Gap | Addresses Risk Engine |
|---|---|---|
| C — Admin interaction | F — After-action review | — |
| H — Outcome dashboard | F — After-action review | — |
| D — Multi-zone cascade | — | Validates Stage 2 cascade scoring |

---

## Implementation Order

### Phase A — Risk Engine Foundation (do first)

1. `src/lib/risk-engine/types.ts` — all interfaces
2. `src/lib/risk-engine/ingest.ts` — Stage 1
3. `src/lib/risk-engine/score.ts` — Stage 2 (with compound hazard support)
4. `src/lib/risk-engine/decide.ts` — Stage 3 (with time-based windows)
5. `src/lib/risk-engine/deliver.ts` — Stage 4
6. `src/lib/risk-engine/feedback.ts` — Stage 5
7. `src/lib/risk-engine/engine.ts` — orchestrator
8. `src/lib/risk-engine/engine.test.ts` — tests
9. `src/lib/types.ts` — new exports
10. `PRD.md` — risk engine section

### Phase B — Simulation Improvements (after Phase A)

11. Scenario-specific step sequences (A)
12. Speed control + pause (F)
13. Branching outcomes (B)
14. Admin interaction points (C)
15. Multi-zone cascade view (D)
16. Live data visualization (G)
17. Outcome dashboard (H)
18. Save/export (I)
19. Failure modes (E)
20. What-if mode (J)

### Phase C — Climate Resilience Gaps (after Phase A)

21. Evacuation center capacity tracking (Gap B)
22. Post-evacuation check-in (Gap D)
23. After-action review dashboard (Gap F)
24. Road condition reporting (Gap H)
25. Multi-language alerts (Gap G)
26. Livestock registration (Gap I)
27. Mental health resources (Gap J)

### Estimated Effort

| Phase | Items | Effort |
|---|---|---|
| A — Risk Engine | 10 files | Medium |
| B — Simulation | 10 items | Medium-High |
| C — Climate Resilience | 7 items | Medium |
| **Total** | **27 items** | **High** |

### Dependencies

- Phase B depends on Phase A (simulation uses risk engine for real computation)
- Phase C partially depends on Phase A (capacity tracking feeds into risk engine)
- Phase C items 25–27 are independent and can be done in any order

---

*This plan consolidates three separate analyses into one document. Each section can be implemented independently, but the risk engine (Part 1) is the foundation that the other two build on.*
