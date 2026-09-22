# Judge-Ready Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In two days, remove the one safety-critical falsehood the app ships, cut the friction out of the report and onboarding flows, and add an offline peer-to-peer alert transfer that works between two phones with no network.

**Architecture:** Three independent slices. (1) A small pure-predicate module (`zone-data-quality.ts`) that every surface consults before rendering placeholder infrastructure as if it were real. (2) Interaction-cost reductions in existing components — one-tap reporting with undo, auto-attempted GPS onboarding, and removal of dead auth UI. (3) A new self-contained alert payload encoded into a URL fragment, rendered by a new `/a` route that reads it entirely client-side, so a shared alert opens from service-worker cache with the server never contacted; the recipient's native camera app is the QR scanner, so no scanning code is written.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, React 19, Tailwind, shadcn/ui, Vitest + @testing-library/react, `qrcode` (new dependency, QR rendering only).

**Spec:** `PRD.md` — specifically the Non-Functional Requirements ("Runs on low-end Android devices", "It takes one tap"), the Anti-Abuse model, and the Build Status table. Design decisions in this plan that are not in the PRD were settled in the 2026-09-22 planning conversation and are restated inline in each task's rationale.

## Global Constraints

- TypeScript strict. No `any`. No non-null assertions on values that can legitimately be absent.
- Every user-visible string is a `LocalizedText` with both `en` and `fil` keys, rendered through `t(value, lang)` from `@/lib/i18n`.
- No new runtime dependency except `qrcode` (Task 10). `npm run knip` fails the build on unused dependencies and exports.
- Never fabricate safety data. Where real data is absent, say so — do not substitute a plausible-looking default. This is the project's existing ethic and Task 1–3 exist because the nationwide seed violated it.
- Touch targets for emergency actions are at least 48px tall.
- The gate for every task is `npm run lint && npm run typecheck && npm test && npm run knip`. `npm run build` additionally before the final commit of each day — it type-checks test files more strictly than `tsc --noEmit` alone and has caught errors `typecheck` missed on this codebase.
- Commit after every task. Never use `--no-verify`.

## Review Focus

Five failure modes the design implies that no single task's happy path exercises. Each has a test assigned to the task that owns the code.

1. **Non-ASCII text in a shared alert payload.** Filipino copy contains characters outside Latin-1; `btoa(JSON.stringify(...))` throws on them. Encoding must round-trip "Baha hanggang tuhod" and "ñ" intact. — pinned in Task 8.
2. **A shared alert truncated by an SMS carrier.** A clipped base64 fragment must decode to `null` and render a plain "this link is damaged" message, never throw and never render a half-populated alert. — pinned in Task 8.
3. **A shared alert for a zone this device has never seen.** The recipient may be in another municipality with no local data for that zone. The alert must still render from the text it carries. — pinned in Task 9.
4. **Undo tapped after the outbox already delivered the report.** The report is gone from the queue; undo must degrade to a no-op that tells the truth, not silently appear to succeed. — pinned in Task 6.
5. **A hotline that is present but malformed.** The seed uses `00000000000`; a real barangay may have a short or spaced number. The predicate must reject all-zero and empty, and accept anything else rather than guessing at format. — pinned in Task 1.

---

## File Structure

**Created:**
- `src/lib/zone-data-quality.ts` — pure predicates: does this zone carry real hotline / evacuation-centre data
- `src/lib/zone-data-quality.test.ts`
- `src/features/water-level-report/quick-depth-report.tsx` — one-tap depth buttons with undo
- `src/features/water-level-report/quick-depth-report.test.tsx`
- `src/lib/alert-share/payload.ts` — encode/decode a self-contained alert
- `src/lib/alert-share/payload.test.ts`
- `src/app/a/page.tsx` — renders a shared alert from the URL fragment
- `src/app/a/shared-alert-view.tsx` — the client component doing the fragment read
- `src/app/a/shared-alert-view.test.tsx`
- `src/features/alerts/share-alert-qr.tsx` — QR rendering for an alert link
- `src/features/alerts/share-alert-qr.test.tsx`

**Modified:**
- `src/components/emergency-hotline-button.tsx` — no longer renders for a placeholder hotline
- `src/features/homepage-map/homepage-map.tsx` — mount `QuickDepthReport`
- `src/app/report/page.tsx` — honest evacuation-centre line
- `src/features/auth/sign-in-panel.tsx` — remove resident password sign-up, hide dead magic-link mode
- `src/features/auth/account-link.tsx` — status text states the consequence
- `src/features/onboarding/zone-picker.tsx` — auto-attempt location on mount, pre-select the result
- `src/features/alerts/share-alert-button.tsx` — share text carries the payload link

---

## Task 1: Zone data quality predicates

The nationwide seed wrote `hotline_number = '00000000000'` and an empty `evacuationCenterName` for roughly 41,798 of 41,803 zones. Every surface currently renders those as if real: a tappable hotline that does not ring, a nameless evacuation centre pinned at the zone centroid. This module is the single place that decides what counts as real, so the three consuming surfaces cannot drift apart.

**Files:**
- Create: `src/lib/zone-data-quality.ts`
- Test: `src/lib/zone-data-quality.test.ts`

**Interfaces:**
- Consumes: `Zone` from `@/lib/types`
- Produces: `hasRealHotline(zone: Zone): boolean`, `hasRealEvacuationCenter(zone: Zone): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/zone-data-quality.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { hasRealHotline, hasRealEvacuationCenter } from "./zone-data-quality";
import type { Zone } from "@/lib/types";

const ZONE: Zone = {
  id: "zone-1",
  psgcBarangayCode: "0105528012",
  name: "Barangay Nilombot, Mapandan",
  municipalityName: "Mapandan",
  provinceName: "Pangasinan",
  evacuationCenterName: "Nilombot Elementary School",
  evacuationRouteText: { en: "Head to the barangay road.", fil: "Dumaan sa barangay road." },
  lat: 16.0288,
  lng: 120.4366,
  evacuationCenterLat: 16.0295,
  evacuationCenterLng: 120.436,
  evacuationRoutePath: [[16.0288, 120.4366]],
  hotlineNumber: "09171234567",
  centerStatus: "space_available",
  evacuationCenterCapacity: 300,
};

describe("hasRealHotline", () => {
  it("accepts a real number", () => {
    expect(hasRealHotline(ZONE)).toBe(true);
  });

  it("rejects the nationwide seed's all-zero placeholder", () => {
    // 41,798 zones carry exactly this. Rendering it as a tappable hotline
    // means a resident dials nothing during a flood.
    expect(hasRealHotline({ ...ZONE, hotlineNumber: "00000000000" })).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(hasRealHotline({ ...ZONE, hotlineNumber: "" })).toBe(false);
  });

  it("rejects whitespace only", () => {
    expect(hasRealHotline({ ...ZONE, hotlineNumber: "   " })).toBe(false);
  });

  it("accepts an unusual but non-empty number rather than guessing at format", () => {
    // Review Focus 5: a real barangay may use a short landline or a spaced
    // number. This predicate's job is to catch the placeholder, not to
    // validate Philippine dialling plans — a wrong format still reaches a
    // human, a rejected real number does not.
    expect(hasRealHotline({ ...ZONE, hotlineNumber: "075-632-1234" })).toBe(true);
    expect(hasRealHotline({ ...ZONE, hotlineNumber: "117" })).toBe(true);
  });
});

describe("hasRealEvacuationCenter", () => {
  it("accepts a named centre", () => {
    expect(hasRealEvacuationCenter(ZONE)).toBe(true);
  });

  it("rejects the seed's nameless placeholder", () => {
    expect(hasRealEvacuationCenter({ ...ZONE, evacuationCenterName: "" })).toBe(false);
  });

  it("rejects whitespace only", () => {
    expect(hasRealEvacuationCenter({ ...ZONE, evacuationCenterName: "  " })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/zone-data-quality.test.ts`
Expected: FAIL — `Failed to resolve import "./zone-data-quality"`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/zone-data-quality.ts`:

```typescript
import type { Zone } from "@/lib/types";

/**
 * Whether a zone carries safety infrastructure that actually exists.
 *
 * The nationwide barangay seed (20260917130740_nationwide_barangays.sql)
 * filled every zone it could not source real data for with placeholders:
 * an all-zero hotline and a nameless evacuation centre pinned at the zone's
 * own centroid. Rendering those as real is the one place this project
 * fabricates safety information — a resident dials a dead number, or walks
 * to an arbitrary GPS point, during a flood.
 *
 * Every surface that renders a hotline or an evacuation centre consults
 * these first, so "we don't have this for your barangay" is said once,
 * consistently, instead of each screen inventing its own idea of real.
 */

/** The seed's placeholder is all zeroes; a real number never is. */
const ALL_ZEROES = /^0+$/;

export function hasRealHotline(zone: Zone): boolean {
  const number = zone.hotlineNumber.trim();
  if (number.length === 0) return false;
  return !ALL_ZEROES.test(number);
}

export function hasRealEvacuationCenter(zone: Zone): boolean {
  return zone.evacuationCenterName.trim().length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/zone-data-quality.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/zone-data-quality.ts src/lib/zone-data-quality.test.ts
git commit -m "feat: predicates for whether a zone's safety data is real

The nationwide seed wrote an all-zero hotline and a nameless evacuation
centre for ~41,798 zones. Nothing distinguished those from real data, so
every surface rendered them as if they rang and existed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Stop rendering a hotline that does not ring

`EmergencyHotlineButton` is mounted globally and renders a red floating call button for whatever `hotlineNumber` it is handed. For most barangays that is `tel:00000000000`.

**Files:**
- Modify: `src/components/emergency-hotline-button.tsx`
- Test: `src/components/emergency-hotline-button.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `hasRealHotline` from Task 1
- Produces: `EmergencyHotlineButton` now returns `null` for a placeholder number; its props are unchanged

- [ ] **Step 1: Write the failing test**

Create `src/components/emergency-hotline-button.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmergencyHotlineButton } from "./emergency-hotline-button";
import { LanguageProvider } from "@/features/i18n/language-provider";

function renderButton(hotlineNumber: string) {
  return render(
    <LanguageProvider>
      <EmergencyHotlineButton hotlineNumber={hotlineNumber} />
    </LanguageProvider>
  );
}

describe("EmergencyHotlineButton", () => {
  it("renders a tel: link for a real number", () => {
    renderButton("09171234567");
    expect(screen.getByRole("link")).toHaveAttribute("href", "tel:09171234567");
  });

  it("renders nothing for the seed's placeholder number", () => {
    // A red emergency call button that dials 00000000000 is worse than no
    // button: it costs a resident the seconds they spend discovering it
    // does not work.
    renderButton("00000000000");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty number", () => {
    renderButton("");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/emergency-hotline-button.test.tsx`
Expected: FAIL on "renders nothing for the seed's placeholder number" — a link is found.

- [ ] **Step 3: Write minimal implementation**

In `src/components/emergency-hotline-button.tsx`, add the import beside the existing ones:

```typescript
import { hasRealHotline } from "@/lib/zone-data-quality";
```

Then, immediately after `const { lang } = useLanguage();`, insert:

```typescript
  // A placeholder hotline is not a degraded feature, it is a wrong answer:
  // the resident taps a red emergency button and nothing rings. Render
  // nothing instead, so the absence is obvious before an emergency rather
  // than during one. See src/lib/zone-data-quality.ts.
  if (!hasRealHotline({ hotlineNumber } as Parameters<typeof hasRealHotline>[0])) {
    return null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/emergency-hotline-button.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 5: Run the full suite — this component is mounted globally**

Run: `npm test`
Expected: PASS. If a test elsewhere asserted the hotline button exists while using a fixture with a placeholder number, update that fixture to a real number rather than weakening this guard.

- [ ] **Step 6: Commit**

```bash
git add src/components/emergency-hotline-button.tsx src/components/emergency-hotline-button.test.tsx
git commit -m "fix: emergency hotline button dialled 00000000000 for most barangays

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Honest evacuation-centre line on the report page

The report page renders `Evacuation center: {zone.evacuationCenterName}` with a status badge. For a placeholder zone that reads as an empty name beside a confident "Space available" badge.

**Files:**
- Modify: `src/app/report/page.tsx` — the `EVACUATION_CENTER` line inside the zone-context `Card`
- Test: `src/app/report/page.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `hasRealEvacuationCenter` from Task 1

- [ ] **Step 1: Add the copy constant**

In `src/app/report/page.tsx`, beside the other `LocalizedText` constants near the top:

```typescript
const NO_CENTER_ON_RECORD: LocalizedText = {
  en: "No evacuation centre on record — ask your barangay captain",
  fil: "Walang nakatalang evacuation centre — magtanong sa inyong barangay captain",
};
```

- [ ] **Step 2: Write the failing test**

Create `src/app/report/page.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import ReportPage from "./page";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

// The report page mounts the live-position watch; only geolocation is faked
// (never the whole navigator — Leaflet reads userAgent at module init).
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() },
});

describe("ReportPage evacuation centre line", () => {
  it("names the centre when the zone has a real one", () => {
    renderWithData(<ReportPage />);
    expect(screen.getByText(/Nilombot/i)).toBeInTheDocument();
  });

  it("says no centre is on record rather than showing a blank name with a status badge", () => {
    const zones = FIXTURE_REFERENCE_DATA.zones.map((zone) => ({
      ...zone,
      evacuationCenterName: "",
    }));
    renderWithData(<ReportPage />, { data: { ...FIXTURE_REFERENCE_DATA, zones } });
    expect(screen.getByText(/no evacuation centre on record/i)).toBeInTheDocument();
  });
});
```

> If `renderWithData` does not accept a `data` override, read `src/test-utils/render-with-data.tsx` and add one — a single optional `data` property defaulting to `FIXTURE_REFERENCE_DATA`. Do not duplicate the helper.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/app/report/page.test.tsx`
Expected: FAIL on the second test — the text is not present.

- [ ] **Step 4: Write minimal implementation**

In `src/app/report/page.tsx`, add to the imports:

```typescript
import { hasRealEvacuationCenter } from "@/lib/zone-data-quality";
```

Replace the evacuation-centre `<span>` inside the zone-context card — the one currently containing `{t(EVACUATION_CENTER, lang)}: {zone.evacuationCenterName}` and the status badge — with:

```tsx
              <span className="flex items-center gap-1.5">
                <Building2 aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                {hasRealEvacuationCenter(zone) ? (
                  <>
                    {t(EVACUATION_CENTER, lang)}: {zone.evacuationCenterName}
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CENTER_STATUS_CLASS[centerStatus]}`}>
                      {t(CENTER_STATUS_LABEL[centerStatus], lang)}
                    </span>
                  </>
                ) : (
                  // No status badge here on purpose: "Space available" beside
                  // a blank name is a claim about a centre that does not exist.
                  <span lang={lang} className="text-muted-foreground">
                    {t(NO_CENTER_ON_RECORD, lang)}
                  </span>
                )}
              </span>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/report/page.test.tsx`
Expected: PASS, 2 tests

- [ ] **Step 6: Commit**

```bash
git add src/app/report/page.tsx src/app/report/page.test.tsx src/test-utils/render-with-data.tsx
git commit -m "fix: report page showed a blank centre name beside 'Space available'

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Remove resident password sign-up and the dead magic-link mode

The sign-in panel currently offers residents email+password account creation and an "Email me a sign-in link" flow. The password path contradicts the anonymous-by-default design — a resident gains nothing from an account — and the magic link cannot work at all because project SMTP has never been configured, so the button reports a failure every time it is pressed. Google OAuth for officials stays.

**Files:**
- Modify: `src/features/auth/sign-in-panel.tsx`
- Modify: `src/features/auth/sign-in-panel.test.tsx`
- Modify: `src/lib/auth/sign-in.ts` — remove the now-unused exports

**Interfaces:**
- Produces: `SignInPanel` renders Google plus, for residents only, a "Continue" button. `signUpWithPassword`, `signInWithPassword` and `sendEmailSignInLink` are deleted from `@/lib/auth/sign-in`.

- [ ] **Step 1: Write the failing test**

In `src/features/auth/sign-in-panel.test.tsx`, add:

```typescript
  it("offers no password account creation to residents", () => {
    // A resident never needs an account: reports are attributed to an
    // anonymous session. Offering sign-up is friction with no payoff, and
    // implies the app is unusable without it.
    render(
      <LanguageProvider>
        <SignInPanel next="/" />
      </LanguageProvider>
    );
    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("offers no email sign-in link, which cannot work without project SMTP", () => {
    render(
      <LanguageProvider>
        <SignInPanel next="/" />
      </LanguageProvider>
    );
    expect(screen.queryByRole("button", { name: /email me a sign-in link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /magic link/i })).not.toBeInTheDocument();
  });

  it("still offers Google, which is how officials sign in", () => {
    render(
      <LanguageProvider>
        <SignInPanel next="/admin" />
      </LanguageProvider>
    );
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/auth/sign-in-panel.test.tsx`
Expected: FAIL — password field and magic-link toggle are present.

- [ ] **Step 3: Delete the dead UI**

In `src/features/auth/sign-in-panel.tsx`:

1. Delete these constants: `EMAIL_LABEL`, `PASSWORD_LABEL`, `EMAIL_SIGN_IN_LINK`, `CHECK_YOUR_EMAIL`, `SIGN_IN_BTN`, `CREATE_ACCOUNT`, `USE_MAGIC_LINK`, `USE_PASSWORD`, `ACCOUNT_CREATED`, `NO_ACCOUNT`, `HAVE_ACCOUNT`.
2. Delete the `Mode` type and narrow `Control` to `type Control = "google" | "existing";`
3. Delete the state: `mode`, `email`, `password`, `isSignUp`, `emailSent`, `accountCreated`.
4. Delete both `<form>` blocks and the mode-toggle `<button>` beneath them.
5. Delete the `email`/`password` branches inside `handleResult` — only `google` and `existing` remain.
6. Remove the now-unused imports: `Input`, `Label`, `sendEmailSignInLink`, `signInWithPassword`, `signUpWithPassword`, `useRouter`. Keep `router` only if `existing` still needs it; it does not — delete it.
7. Change the resident label from `CONTINUE_AS_GUEST` to a plainer one. Replace the constant with:

```typescript
const CONTINUE_WITHOUT_ACCOUNT: LocalizedText = {
  en: "Continue — no account needed",
  fil: "Magpatuloy — hindi kailangan ng account",
};
```

and use it in the existing `!isOfficial` button.

- [ ] **Step 4: Delete the now-unused auth functions**

In `src/lib/auth/sign-in.ts`, delete `sendEmailSignInLink`, `signInWithPassword`, and `signUpWithPassword` along with any of their tests in `src/lib/auth/sign-in.test.ts`. Keep `startGoogleSignIn` and `SignInResult`.

- [ ] **Step 5: Run tests and knip**

Run: `npx vitest run src/features/auth src/lib/auth && npm run knip`
Expected: tests PASS; knip reports no unused exports. If knip flags a leftover export, delete it rather than re-exporting it.

- [ ] **Step 6: Commit**

```bash
git add src/features/auth src/lib/auth
git commit -m "refactor: drop resident password sign-up and the dead magic-link path

A resident never needs an account — reports are attributed to an anonymous
session. The magic link could never work: project SMTP has never been set
up, so the button reported a failure on every press.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Account status states the consequence, not the category

"Guest" implies a lesser state the resident should fix. Guest is the correct state for almost every user. Say what it means instead.

**Files:**
- Modify: `src/features/auth/account-link.tsx`
- Modify: `src/features/auth/account-link.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/features/auth/account-link.test.tsx`, add:

```typescript
  it("tells a signed-out visitor what their state means rather than labelling them", async () => {
    // "Guest" reads as second-class for what is the correct state for
    // almost every resident. State the consequence instead.
    renderAccountLink();
    expect(await screen.findByText(/saved on this device/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Guest$/)).not.toBeInTheDocument();
  });
```

> Use whatever render helper the existing tests in this file already use; do not introduce a second one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/auth/account-link.test.tsx`
Expected: FAIL — "Guest" is rendered.

- [ ] **Step 3: Write minimal implementation**

In `src/features/auth/account-link.tsx`, replace the `GUEST_LABEL` constant:

```typescript
const ON_THIS_DEVICE: LocalizedText = {
  en: "Saved on this device",
  fil: "Nakatago sa device na ito",
};
```

and in the final return block, swap `{t(GUEST_LABEL, lang)}` for `{t(ON_THIS_DEVICE, lang)}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/auth/account-link.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/account-link.tsx src/features/auth/account-link.test.tsx
git commit -m "fix: account status said 'Guest' for the app's normal state

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: One-tap depth report with undo

The PRD promises "It takes one tap." Filing a report currently costs four touches: navigate to `/report`, pick a depth (the default is `dry`, so nobody can skip this), then Submit. This task puts five depth buttons on the homepage where the tap itself is the submission, and pays for the removed confirm step with a three-second undo instead — a confirm taxes every user, an undo taxes only the person who mis-tapped.

**Files:**
- Create: `src/features/water-level-report/quick-depth-report.tsx`
- Create: `src/features/water-level-report/quick-depth-report.test.tsx`
- Modify: `src/features/homepage-map/homepage-map.tsx`

**Interfaces:**
- Consumes: `addWaterLevelReport(zoneId, depthLevel, position)` from `@/lib/water-level-reports`; `discardEntry(id)` from `@/lib/outbox/outbox`; `useLivePosition()` from `@/features/homepage-map/use-live-position`
- Produces: `<QuickDepthReport zoneId={string} />`

- [ ] **Step 1: Confirm the outbox API for undo**

Run: `grep -n "export function discardEntry\|export function enqueue" src/lib/outbox/outbox.ts`

`enqueue` returns the created `OutboxEntry`. Note the exact name of the function that removes a queued entry by id — the test and implementation below assume `discardEntry(id: string): void`. If it is named differently, use the real name consistently in both.

- [ ] **Step 2: Write the failing test**

Create `src/features/water-level-report/quick-depth-report.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickDepthReport } from "./quick-depth-report";
import { renderWithData } from "@/test-utils/render-with-data";
import { readOutbox } from "@/lib/outbox/outbox";

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() },
  });
});

describe("QuickDepthReport", () => {
  it("files the report on the depth tap itself — one tap, no separate submit", async () => {
    const user = userEvent.setup();
    renderWithData(<QuickDepthReport zoneId="zone-1" />);

    await user.click(screen.getByRole("button", { name: /knee-deep/i }));

    const queued = readOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0].payload).toMatchObject({ zoneId: "zone-1", depthLevel: "knee" });
  });

  it("offers undo instead of asking for confirmation first", async () => {
    const user = userEvent.setup();
    renderWithData(<QuickDepthReport zoneId="zone-1" />);

    await user.click(screen.getByRole("button", { name: /waist-deep/i }));
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /undo/i }));
    expect(readOutbox()).toHaveLength(0);
  });

  it("stops offering undo once the window has passed", async () => {
    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderWithData(<QuickDepthReport zoneId="zone-1" />);

      await user.click(screen.getByRole("button", { name: /ankle-deep/i }));
      expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
      expect(readOutbox()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("degrades to a truthful message when undo lands after delivery", async () => {
    // Review Focus 4: the drain may deliver the report between the tap and
    // the undo. The entry is gone from the queue; undo must say so rather
    // than appear to succeed at withdrawing something already filed.
    const user = userEvent.setup();
    renderWithData(<QuickDepthReport zoneId="zone-1" />);

    await user.click(screen.getByRole("button", { name: /neck-deep/i }));
    // Simulate the drain clearing the queue before undo is pressed.
    window.localStorage.setItem("weatherwell.outbox", "[]");

    await user.click(screen.getByRole("button", { name: /undo/i }));

    expect(screen.getByRole("status").textContent).toMatch(/already sent|already reached/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/features/water-level-report/quick-depth-report.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

Create `src/features/water-level-report/quick-depth-report.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { useLivePosition } from "@/features/homepage-map/use-live-position";
import { t } from "@/lib/i18n";
import { DEPTH_LEVELS, DEPTH_LABEL, DEPTH_CM, type DepthLevel } from "@/lib/depth";
import { addWaterLevelReport } from "@/lib/water-level-reports";
import { discardEntry, readOutbox } from "@/lib/outbox/outbox";
import type { LocalizedText } from "@/lib/types";

const HOW_DEEP: LocalizedText = {
  en: "How deep is the water where you are?",
  fil: "Gaano kalalim ang tubig kung nasaan ka?",
};
const RECORDED: LocalizedText = { en: "Reported", fil: "Naiulat" };
const UNDO: LocalizedText = { en: "Undo", fil: "Bawiin" };
const NOT_SAVED: LocalizedText = {
  en: "Report not saved — your phone's storage is full or blocked.",
  fil: "Hindi naitala ang ulat — puno o naka-block ang storage ng telepono.",
};
const ALREADY_SENT: LocalizedText = {
  en: "Already sent to the barangay — it can't be taken back.",
  fil: "Naipadala na sa barangay — hindi na ito mababawi.",
};

/** How long the resident has to take back a mis-tap. */
const UNDO_WINDOW_MS = 3000;

type State =
  | { kind: "idle" }
  | { kind: "reported"; entryId: string; depthLevel: DepthLevel }
  | { kind: "undone" }
  | { kind: "too-late" }
  | { kind: "failed" };

/**
 * Five depth buttons where the tap IS the submission — the PRD's "it takes
 * one tap", which the /report form never delivered (navigate, pick, submit,
 * with `dry` as the default so the pick could not be skipped).
 *
 * There is deliberately no confirmation step. A confirm taxes every single
 * resident to guard against the rare mis-tap; a three-second undo taxes only
 * the person who actually mis-tapped. In an emergency, always pay the
 * mistake cost rather than the everyone cost.
 */
export function QuickDepthReport({ zoneId }: { zoneId: string }) {
  const { lang } = useLanguage();
  const position = useLivePosition();
  const [state, setState] = useState<State>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function report(depthLevel: DepthLevel) {
    if (timer.current) clearTimeout(timer.current);
    try {
      const entry = addWaterLevelReport(zoneId, depthLevel, position);
      setState({ kind: "reported", entryId: entry.id, depthLevel });
      timer.current = setTimeout(() => setState({ kind: "idle" }), UNDO_WINDOW_MS);
    } catch {
      // enqueue throws OutboxWriteFailed when local storage is full or
      // blocked, meaning the report reached neither the queue nor the wire.
      // Saying "Reported" here would be the one lie this surface must not
      // tell.
      setState({ kind: "failed" });
    }
  }

  function undo(entryId: string) {
    if (timer.current) clearTimeout(timer.current);
    const stillQueued = readOutbox().some((entry) => entry.id === entryId);
    if (!stillQueued) {
      // The drain delivered it between the tap and the undo. Nothing to
      // withdraw, and pretending otherwise would tell a resident their
      // report is gone when the barangay already has it.
      setState({ kind: "too-late" });
      return;
    }
    discardEntry(entryId);
    setState({ kind: "undone" });
  }

  return (
    <section className="space-y-3">
      <h2 lang={lang} className="text-sm font-medium">
        {t(HOW_DEEP, lang)}
      </h2>

      <div className="grid grid-cols-5 gap-1.5">
        {DEPTH_LEVELS.map((level) => (
          <Button
            key={level}
            type="button"
            variant="outline"
            onClick={() => report(level)}
            className="h-auto min-h-16 flex-col gap-0.5 px-1 py-2"
          >
            <span lang={lang} className="text-xs leading-tight font-medium">
              {t(DEPTH_LABEL[level], lang)}
            </span>
            <span className="text-[10px] text-muted-foreground">~{DEPTH_CM[level]}cm</span>
          </Button>
        ))}
      </div>

      <div role="status" aria-live="polite" className="min-h-9 text-sm">
        {state.kind === "reported" && (
          <span className="flex items-center gap-2">
            <span lang={lang} className="text-green-500">
              {t(RECORDED, lang)}: {t(DEPTH_LABEL[state.depthLevel], lang)}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => undo(state.entryId)}>
              {t(UNDO, lang)}
            </Button>
          </span>
        )}
        {state.kind === "too-late" && (
          <span lang={lang} className="text-muted-foreground">
            {t(ALREADY_SENT, lang)}
          </span>
        )}
        {state.kind === "failed" && (
          <span lang={lang} className="text-severity-red">
            {t(NOT_SAVED, lang)}
          </span>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Make `addWaterLevelReport` return the queued entry**

The component needs the entry id to undo. In `src/lib/water-level-reports.ts`, change the signature to return what `enqueue` already returns:

```typescript
export function addWaterLevelReport(
  zoneId: string,
  depthLevel: DepthLevel,
  position?: { lat: number; lng: number } | null
): OutboxEntry {
  const entry = enqueue("submitWaterLevelReport", {
    zoneId,
    depthLevel,
    ...(position ? { lat: position.lat, lng: position.lng } : {}),
  });
  triggerDrain();
  return entry;
}
```

Add `OutboxEntry` to the existing type import from `./outbox/types` if it is not already there. Existing callers ignore the return value and are unaffected.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/features/water-level-report/quick-depth-report.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 7: Mount it on the homepage**

In `src/features/homepage-map/homepage-map.tsx`, import the component and render it directly above the quick-action buttons:

```tsx
import { QuickDepthReport } from "@/features/water-level-report/quick-depth-report";
```

```tsx
<QuickDepthReport zoneId={selectedZone.id} />
```

Use whatever the file already calls the currently-selected zone. Run `npm test` afterwards — `homepage-map.test.tsx` asserts on homepage text and may need its queries scoped now that five depth labels are present.

- [ ] **Step 8: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run knip`
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add src/features/water-level-report src/features/homepage-map src/lib/water-level-reports.ts
git commit -m "feat: one-tap depth reporting on the homepage, with undo

The PRD promises 'it takes one tap'; filing a report cost four touches.
The tap is now the submission. No confirm step — a confirm taxes every
resident to guard against the rare mis-tap, a three-second undo taxes only
the person who mis-tapped.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: GPS-first onboarding

`ZonePicker` already has "Use my location" above the search box, but it is a secondary-styled button the resident must find and press, and a successful detection only prints a message — the zone still has to be selected and confirmed. Attempt the read automatically on mount and pre-select the result, so the common path is a single "Confirm" tap.

**Files:**
- Modify: `src/features/onboarding/zone-picker.tsx`
- Modify: `src/features/onboarding/zone-picker.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/features/onboarding/zone-picker.test.tsx`, add:

```typescript
  it("attempts the location read on mount and pre-selects the detected barangay", async () => {
    // Typing a barangay name costs ~9 keystrokes and risks picking the
    // wrong one — Philippine barangay names repeat heavily (Poblacion,
    // San Jose). A wrong pick means a wrong evacuation route.
    mockZoneApis({
      nearest: {
        id: "zone-1",
        name: "Barangay Nilombot, Mapandan",
        municipalityName: "Mapandan",
        provinceName: "Pangasinan",
        lat: 16.0288,
        lng: 120.4366,
      },
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 16.0288, longitude: 120.4366, accuracy: 20 } } as GeolocationPosition),
      },
    });

    render(<ZonePicker onConfirm={vi.fn()} />);

    expect(await screen.findByText(/Barangay Nilombot, Mapandan/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /confirm barangay/i })).toBeEnabled();
  });

  it("falls back to search when the resident denies location", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) =>
          error?.({ code: 1, message: "denied" } as GeolocationPositionError),
      },
    });

    render(<ZonePicker onConfirm={vi.fn()} />);

    expect(await screen.findByLabelText(/search barangay/i)).toBeInTheDocument();
  });
```

> Match the existing file's helpers — it already uses `mockZoneApis` from `@/test-utils/mock-zone-apis` and its own `ZonePicker` props. Adapt the prop names to whatever the component actually takes; do not change the component's public props in this task.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/onboarding/zone-picker.test.tsx`
Expected: FAIL — nothing is detected until the button is pressed.

- [ ] **Step 3: Auto-attempt on mount**

In `src/features/onboarding/zone-picker.tsx`, add an effect that runs the existing `handleUseMyLocation` logic once on mount. Extract the body of `handleUseMyLocation` into a `useCallback` named `detectLocation` so both the effect and the button can call it, then:

```tsx
  // Attempted automatically rather than waiting for a tap: for a resident
  // who allows location this turns onboarding into a single Confirm press,
  // and it removes the wrong-barangay risk that a typed search carries
  // (Philippine barangay names repeat heavily — a mis-pick means a wrong
  // evacuation route). A denial or a failure just falls through to the
  // search box below, exactly as before.
  useEffect(() => {
    void detectLocation();
  }, [detectLocation]);
```

- [ ] **Step 4: Pre-select the detected zone**

In the `detecting` success path, when the nearest zone is within `APPROXIMATE_ACCURACY_METERS`, call the existing `setSelectedZone(zone)` in addition to setting the `near` detection state. Leave the `far` case unselected — a resident kilometres from any zone should choose deliberately.

Keep the "Use my location" button rendered for retry, but change its label to a retry-appropriate one when `detection.state === "failed"`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/onboarding/zone-picker.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/onboarding
git commit -m "feat: onboarding attempts location on mount and pre-selects the barangay

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Self-contained shared alert payload

An alert becomes a string that carries everything needed to render it, so a forwarded alert opens with the server never contacted. This is the encode/decode core; Tasks 9 and 10 build the route and the share surface on it.

**Files:**
- Create: `src/lib/alert-share/payload.ts`
- Create: `src/lib/alert-share/payload.test.ts`

**Interfaces:**
- Produces: `encodeAlert(alert: SharedAlert): string`, `decodeAlert(encoded: string): SharedAlert | null`, `buildShareText(alert: SharedAlert, origin: string, lang: LanguageCode): string`, and the `SharedAlert` interface

- [ ] **Step 1: Write the failing test**

Create `src/lib/alert-share/payload.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encodeAlert, decodeAlert, buildShareText, type SharedAlert } from "./payload";

const ALERT: SharedAlert = {
  v: 1,
  zoneId: "zone-1",
  zoneName: "Barangay Nilombot, Mapandan",
  severity: "red",
  issuedAt: "2026-09-22T14:32:00.000Z",
  message: "Knee-deep flooding reported along the main road.",
  centerName: "Nilombot Elementary School",
  hotline: "09171234567",
};

describe("encodeAlert / decodeAlert", () => {
  it("round-trips an alert", () => {
    expect(decodeAlert(encodeAlert(ALERT))).toEqual(ALERT);
  });

  it("round-trips non-ASCII Filipino text", () => {
    // Review Focus 1: btoa() throws on anything outside Latin-1, so the
    // encoder must go through UTF-8 bytes. Filipino copy and Spanish-derived
    // barangay names (Señor, Peñaranda) hit this immediately.
    const filipino: SharedAlert = {
      ...ALERT,
      zoneName: "Barangay Señor, Peñaranda",
      message: "Baha hanggang tuhod sa kalsada — lumikas na.",
    };
    expect(decodeAlert(encodeAlert(filipino))).toEqual(filipino);
  });

  it("returns null for a truncated payload rather than throwing", () => {
    // Review Focus 2: carriers split and sometimes clip long SMS bodies.
    const encoded = encodeAlert(ALERT);
    expect(decodeAlert(encoded.slice(0, encoded.length - 10))).toBeNull();
  });

  it("returns null for junk", () => {
    expect(decodeAlert("not-base64!!")).toBeNull();
    expect(decodeAlert("")).toBeNull();
  });

  it("returns null for a payload from a newer app version", () => {
    const future = encodeAlert({ ...ALERT, v: 2 as 1 });
    expect(decodeAlert(future)).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    const partial = encodeAlert({ ...ALERT, zoneName: undefined as unknown as string });
    expect(decodeAlert(partial)).toBeNull();
  });
});

describe("buildShareText", () => {
  it("leads with text a person can act on with no app at all", () => {
    const text = buildShareText(ALERT, "https://weatherwell.app", "en");
    const firstLine = text.split("\n")[0];
    expect(firstLine).toContain("Barangay Nilombot, Mapandan");
    expect(firstLine.toUpperCase()).toContain("RED");
  });

  it("carries the payload in a URL fragment, which never reaches the server", () => {
    const text = buildShareText(ALERT, "https://weatherwell.app", "en");
    const url = text.split(/\s+/).find((part) => part.startsWith("https://"));
    expect(url).toBeDefined();
    expect(url).toContain("/a#");
    expect(decodeAlert(url!.split("#")[1])).toEqual(ALERT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/alert-share/payload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/alert-share/payload.ts`:

```typescript
import type { LanguageCode } from "@/lib/types";

/**
 * An alert that carries everything needed to render it, so a forwarded copy
 * opens without the server being contacted at all.
 *
 * This is what makes the share chain a real delivery channel rather than a
 * link back to an origin the resident may not be able to reach. The encoded
 * payload rides in a URL fragment, which browsers never send upstream — so
 * a recipient whose app is already cached by the service worker gets the
 * full alert while completely offline.
 */
export interface SharedAlert {
  /** Bumped when the shape changes; an unknown version decodes to null. */
  v: 1;
  zoneId: string;
  zoneName: string;
  severity: string;
  /** ISO 8601. */
  issuedAt: string;
  /** Already localised by the sharer — the recipient may not share a language setting. */
  message: string;
  centerName?: string;
  hotline?: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeAlert(alert: SharedAlert): string {
  // TextEncoder, never btoa(JSON.stringify(...)) directly: btoa throws on
  // any character outside Latin-1, which Filipino copy and Spanish-derived
  // barangay names contain constantly.
  return toBase64Url(new TextEncoder().encode(JSON.stringify(alert)));
}

function isSharedAlert(value: unknown): value is SharedAlert {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.v === 1 &&
    typeof candidate.zoneId === "string" &&
    typeof candidate.zoneName === "string" &&
    typeof candidate.severity === "string" &&
    typeof candidate.issuedAt === "string" &&
    typeof candidate.message === "string"
  );
}

/**
 * Never throws. A payload clipped by a carrier, mangled by a messaging app,
 * or written by a newer version of the app returns null, and the caller
 * shows a "this link is damaged" message — which is recoverable, where a
 * thrown error on a shared emergency alert is not.
 */
export function decodeAlert(encoded: string): SharedAlert | null {
  if (encoded.length === 0) return null;
  const bytes = fromBase64Url(encoded);
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isSharedAlert(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const HEADING: Record<LanguageCode, string> = {
  en: "WEATHERWELL ALERT",
  fil: "ALERTO NG WEATHERWELL",
};
const EVACUATE_TO: Record<LanguageCode, string> = { en: "Evacuate to", fil: "Lumikas sa" };
const HOTLINE: Record<LanguageCode, string> = { en: "Hotline", fil: "Hotline" };

/**
 * The human-readable alert comes FIRST and the link last, deliberately: if a
 * carrier clips the message, what survives is the part a person with no app
 * and no signal can still act on.
 */
export function buildShareText(alert: SharedAlert, origin: string, lang: LanguageCode): string {
  const time = new Date(alert.issuedAt).toLocaleTimeString(lang === "fil" ? "fil-PH" : "en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = [
    `${HEADING[lang]} - ${alert.zoneName} - ${alert.severity.toUpperCase()} - ${time}`,
    alert.message,
  ];
  if (alert.centerName) lines.push(`${EVACUATE_TO[lang]}: ${alert.centerName}`);
  if (alert.hotline) lines.push(`${HOTLINE[lang]}: ${alert.hotline}`);
  lines.push(`${origin}/a#${encodeAlert(alert)}`);

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/alert-share/payload.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/alert-share
git commit -m "feat: self-contained alert payload for offline peer sharing

An alert encodes into a URL fragment, which browsers never send upstream —
so a forwarded alert renders from service-worker cache with the server
never contacted. Human-readable text leads so a clipped message still
reaches someone with no app at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: The `/a` route renders a shared alert offline

**Files:**
- Create: `src/app/a/page.tsx`
- Create: `src/app/a/shared-alert-view.tsx`
- Create: `src/app/a/shared-alert-view.test.tsx`

**Interfaces:**
- Consumes: `decodeAlert`, `SharedAlert` from Task 8
- Produces: route `/a`, rendering whatever its fragment carries

- [ ] **Step 1: Write the failing test**

Create `src/app/a/shared-alert-view.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SharedAlertView } from "./shared-alert-view";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { encodeAlert, type SharedAlert } from "@/lib/alert-share/payload";

const ALERT: SharedAlert = {
  v: 1,
  zoneId: "zone-unknown-to-this-device",
  zoneName: "Barangay Malimpuec, Mapandan",
  severity: "evacuate",
  issuedAt: "2026-09-22T14:32:00.000Z",
  message: "Waist-deep flooding. Leave now.",
  centerName: "Malimpuec Covered Court",
  hotline: "09171234567",
};

function renderWithHash(hash: string) {
  window.location.hash = hash;
  return render(
    <LanguageProvider>
      <SharedAlertView />
    </LanguageProvider>
  );
}

beforeEach(() => {
  window.location.hash = "";
});

describe("SharedAlertView", () => {
  it("renders an alert for a zone this device has never seen", () => {
    // Review Focus 3: the recipient may be in a different municipality with
    // no local data for this zone. Everything shown comes from the payload,
    // so there is nothing to look up and nothing to fail.
    renderWithHash(`#${encodeAlert(ALERT)}`);

    expect(screen.getByText(/Barangay Malimpuec, Mapandan/)).toBeInTheDocument();
    expect(screen.getByText(/Waist-deep flooding/)).toBeInTheDocument();
    expect(screen.getByText(/Malimpuec Covered Court/)).toBeInTheDocument();
  });

  it("offers the hotline as a tel: link", () => {
    renderWithHash(`#${encodeAlert(ALERT)}`);
    expect(screen.getByRole("link", { name: /09171234567/ })).toHaveAttribute(
      "href",
      "tel:09171234567"
    );
  });

  it("says the link is damaged rather than rendering a half-alert", () => {
    const encoded = encodeAlert(ALERT);
    renderWithHash(`#${encoded.slice(0, encoded.length - 12)}`);

    expect(screen.getByRole("alert").textContent).toMatch(/damaged|incomplete/i);
    expect(screen.queryByText(/Malimpuec Covered Court/)).not.toBeInTheDocument();
  });

  it("says the link is damaged when there is no fragment at all", () => {
    renderWithHash("");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("marks a shared alert as unverified", () => {
    // Nothing yet proves a forwarded alert came from an official. Until
    // signing ships, say so plainly rather than let a forwarded message
    // borrow the authority of the app's own alerts.
    renderWithHash(`#${encodeAlert(ALERT)}`);
    expect(screen.getByText(/forwarded|unverified/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/a/shared-alert-view.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the view**

Create `src/app/a/shared-alert-view.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { decodeAlert, type SharedAlert } from "@/lib/alert-share/payload";
import type { LocalizedText } from "@/lib/types";

const FORWARDED: LocalizedText = {
  en: "Forwarded alert — not verified by this app",
  fil: "Ipinasang alerto — hindi pa napapatunayan ng app na ito",
};
const DAMAGED: LocalizedText = {
  en: "This alert link is damaged or incomplete. Ask whoever sent it to share it again.",
  fil: "Sira o kulang ang link na ito. Pakihingi muli sa nagpadala.",
};
const EVACUATE_TO: LocalizedText = { en: "Evacuate to", fil: "Lumikas sa" };
const OPEN_APP: LocalizedText = { en: "Open WeatherWell for my area", fil: "Buksan ang WeatherWell para sa aking lugar" };
const ISSUED: LocalizedText = { en: "Issued", fil: "Inilabas" };

/**
 * Renders an alert carried entirely in the URL fragment.
 *
 * The fragment is read on the client and never sent to the server by any
 * browser, which is the point: with the app already in the service worker's
 * cache this page renders a brand-new alert while completely offline. That
 * is the difference between showing a resident a stale cached alert and
 * actually delivering a new one through broken infrastructure.
 */
export function SharedAlertView() {
  const { lang } = useLanguage();
  const [alert, setAlert] = useState<SharedAlert | null>(null);
  const [ready, setReady] = useState(false);

  // In an effect, not during render: window does not exist on the server,
  // and this route is prerendered.
  useEffect(() => {
    setAlert(decodeAlert(window.location.hash.replace(/^#/, "")));
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!alert) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 pt-6">
          <p role="alert" lang={lang} className="text-sm">
            {t(DAMAGED, lang)}
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">{t(OPEN_APP, lang)}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <p lang={lang} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
          {t(FORWARDED, lang)}
        </p>
        <CardTitle className="text-lg">{alert.zoneName}</CardTitle>
        <p className="text-sm font-semibold uppercase">{alert.severity}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p lang={lang} className="text-sm">
          {alert.message}
        </p>

        {alert.centerName && (
          <p className="flex items-center gap-1.5 text-sm">
            <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            {t(EVACUATE_TO, lang)}: {alert.centerName}
          </p>
        )}

        {alert.hotline && (
          <Button asChild size="lg" className="w-full">
            <a href={`tel:${alert.hotline}`}>
              <Phone aria-hidden="true" className="h-4 w-4" />
              {alert.hotline}
            </a>
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          {t(ISSUED, lang)}: {new Date(alert.issuedAt).toLocaleString()}
        </p>

        <Button asChild variant="outline" className="w-full">
          <Link href="/">{t(OPEN_APP, lang)}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Write the route**

Create `src/app/a/page.tsx`:

```tsx
import { SharedAlertView } from "./shared-alert-view";

export default function SharedAlertPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6">
      <SharedAlertView />
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/a/shared-alert-view.test.tsx`
Expected: PASS, 5 tests

- [ ] **Step 6: Precache the route so it opens offline**

In `public/sw.js`, add `"/a"` to `PRECACHED_ROUTES` (currently `["/", "/evacuation", "/report", "/map"]`). Without this the shared link only works for someone who has already visited `/a`, which defeats the point.

Bump the worker's `VERSION` constant so existing installs pick up the new precache list.

- [ ] **Step 7: Run the service-worker suite**

Run: `npx vitest run src/lib/service-worker.test.ts`
Expected: PASS — the suite reads `VERSION` from the source rather than restating it, so a bump does not break it.

- [ ] **Step 8: Commit**

```bash
git add src/app/a public/sw.js
git commit -m "feat: /a renders a shared alert entirely from its URL fragment

Precached, so a forwarded alert opens offline with the server never
contacted. Marked 'forwarded — not verified' until signing ships.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Share button carries the payload, plus a QR code

The recipient's own camera app is the scanner — every modern Android and iOS camera reads a QR and offers to open the URL. So no scanning code is written here: only rendering.

**Files:**
- Create: `src/features/alerts/share-alert-qr.tsx`
- Create: `src/features/alerts/share-alert-qr.test.tsx`
- Modify: `src/features/alerts/share-alert-button.tsx`

**Interfaces:**
- Consumes: `buildShareText`, `encodeAlert`, `SharedAlert` from Task 8
- Produces: `<ShareAlertQr alert={SharedAlert} />`

- [ ] **Step 1: Install the QR dependency**

```bash
npm install qrcode && npm install --save-dev @types/qrcode
```

- [ ] **Step 2: Write the failing test**

Create `src/features/alerts/share-alert-qr.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareAlertQr } from "./share-alert-qr";
import { LanguageProvider } from "@/features/i18n/language-provider";
import type { SharedAlert } from "@/lib/alert-share/payload";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,FAKE") },
}));

const ALERT: SharedAlert = {
  v: 1,
  zoneId: "zone-1",
  zoneName: "Barangay Nilombot, Mapandan",
  severity: "red",
  issuedAt: "2026-09-22T14:32:00.000Z",
  message: "Knee-deep flooding reported.",
};

function renderQr() {
  return render(
    <LanguageProvider>
      <ShareAlertQr alert={ALERT} />
    </LanguageProvider>
  );
}

describe("ShareAlertQr", () => {
  it("renders no image until asked, so it costs nothing on an alert nobody shares", () => {
    renderQr();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders a scannable code on request", async () => {
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByRole("button", { name: /qr|show code/i }));

    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/png;base64,FAKE"));
  });

  it("explains that the other phone scans it with its own camera", async () => {
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByRole("button", { name: /qr|show code/i }));

    expect(screen.getByText(/camera/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/features/alerts/share-alert-qr.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

Create `src/features/alerts/share-alert-qr.tsx`:

```tsx
"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { encodeAlert, type SharedAlert } from "@/lib/alert-share/payload";
import type { LocalizedText } from "@/lib/types";

const SHOW_CODE: LocalizedText = { en: "Show QR code", fil: "Ipakita ang QR code" };
const HIDE_CODE: LocalizedText = { en: "Hide QR code", fil: "Itago ang QR code" };
const SCAN_INSTRUCTION: LocalizedText = {
  en: "Point the other phone's camera at this. No internet needed on either phone.",
  fil: "Itutok ang camera ng kabilang telepono dito. Walang kailangang internet sa kahit alin.",
};
const CODE_ALT: LocalizedText = { en: "QR code containing this alert", fil: "QR code na naglalaman ng alertong ito" };

/**
 * Renders the alert as a QR code so it can cross to another phone with no
 * network on either side.
 *
 * Nothing here scans: every modern Android and iOS camera app reads a QR and
 * offers to open the URL it contains, so the recipient needs no app, no
 * permission prompt, and no instructions beyond "point your camera at this".
 * Writing a scanner would add a camera permission and a decoding library to
 * duplicate something the phone already does better.
 */
export function ShareAlertQr({ alert }: { alert: SharedAlert }) {
  const { lang } = useLanguage();
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  async function toggle() {
    if (dataUrl) {
      setDataUrl(null);
      return;
    }
    const url = `${window.location.origin}/a#${encodeAlert(alert)}`;
    // Medium correction: a phone screen in rain, held by someone else, is a
    // worse scanning surface than paper.
    setDataUrl(await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 320 }));
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void toggle()}>
        <QrCode aria-hidden="true" className="h-4 w-4" />
        {t(dataUrl ? HIDE_CODE : SHOW_CODE, lang)}
      </Button>

      {dataUrl && (
        <div className="space-y-2 rounded-md border-2 border-border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated
              data: URL, not an asset next/image can optimise */}
          <img src={dataUrl} alt={t(CODE_ALT, lang)} className="mx-auto h-auto w-full max-w-64" />
          <p lang={lang} className="text-center text-xs text-black">
            {t(SCAN_INSTRUCTION, lang)}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/alerts/share-alert-qr.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 6: Wire the payload into the existing share button**

Read `src/features/alerts/share-alert-button.tsx`. It already composes share text from an `AlertRecord` and a `Zone`. Replace its text construction with `buildShareText`, mapping the existing props into a `SharedAlert`:

```typescript
import { buildShareText, type SharedAlert } from "@/lib/alert-share/payload";
import { hasRealHotline, hasRealEvacuationCenter } from "@/lib/zone-data-quality";
```

```typescript
  const shared: SharedAlert = {
    v: 1,
    zoneId: zone.id,
    zoneName: zone.name,
    severity: alert.severity,
    issuedAt: alert.issuedAt,
    message: t(alert.message, lang),
    // Task 1's predicates apply here too: a forwarded alert must not carry
    // a hotline that does not ring or a centre that does not exist.
    ...(hasRealEvacuationCenter(zone) ? { centerName: zone.evacuationCenterName } : {}),
    ...(hasRealHotline(zone) ? { hotline: zone.hotlineNumber } : {}),
  };

  const text = buildShareText(shared, window.location.origin, lang);
```

Render `<ShareAlertQr alert={shared} />` beneath the existing share button.

- [ ] **Step 7: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run knip && npm run build`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/alerts package.json package-lock.json
git commit -m "feat: share an alert as text-plus-link or as a scannable QR code

The recipient's own camera app is the scanner, so no scanning code, no
camera permission and no decoding library. Two phones with no network can
pass a full alert between them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Verify the whole thing in a browser

Unit tests do not prove a QR scans or that an offline page renders. This project has repeatedly found real bugs only in a live browser (the `useZones()`-before-redirect crash, the invisible Leaflet zoom control) — do not skip this.

- [ ] **Step 1: Start the dev server**

Use `preview_start` with `{name: "weatherwell-dev"}`. Never `npm run dev` through a shell tool.

- [ ] **Step 2: One-tap report**

On `/`, tap a depth button. Confirm: the report appears immediately, an Undo button shows, and it disappears after three seconds. Tap another and press Undo within the window — confirm the queued entry is gone via `localStorage["weatherwell.outbox"]`.

- [ ] **Step 3: Placeholder honesty**

In devtools, set the selected zone to one with `hotlineNumber: "00000000000"`. Confirm the floating red hotline button does not render and the report page says no evacuation centre is on record.

- [ ] **Step 4: The offline share — the demo that matters**

1. Open an alert, press "Show QR code".
2. Copy the `/a#...` URL from the share text.
3. Open a second browser tab, load `/a#...`, confirm the alert renders fully.
4. In that tab's devtools, set the network to **Offline**, then reload. Confirm it still renders from the service-worker cache.
5. Confirm a truncated fragment shows the "damaged" message rather than a blank or broken page.

- [ ] **Step 5: Capture proof**

Take a screenshot of the offline-rendered shared alert. This is the demo screenshot.

- [ ] **Step 6: Commit any fixes found, then stop the server**

```bash
git add -A
git commit -m "fix: issues found in live browser verification

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Deliberately Not In This Plan

Recorded so they are not mistaken for oversights. Each was discussed and cut for the two-day budget:

- **ECDSA signing of shared alerts.** The payload and route are designed for it (`v` field, "not verified" labelling). Adding keygen, build-time key embedding and verification is roughly another day. Ship unsigned-but-honestly-labelled first.
- **IndexedDB single-zone cache.** The 22MB `JSON.parse` on every returning visit is the largest remaining performance problem, and a ~2-day change on its own.
- **Upstream cascade warning.** `downstream_zone_id` is in the schema and populated for one zone. The highest-value feature discussed, and the first thing to build after this plan.
- **Dark-barangay detection, transparency page, photo gauge stations, SMS gateway, neighbour relay, printable sheet, regional language.**
- **Cutting typhoon tracking, weather readings, the prediction engine and `trust_weight`.** Deletion is safe but touches many files; it earns nothing a judge sees in two days.
- **`VAPID_PRIVATE_KEY`.** Push cannot send until this is set in Vercel. It is a manual secret-store action this session is blocked from performing — the owner must do it.

---

## Self-Review

**Spec coverage.** The PRD's "it takes one tap" is Task 6. "Runs on low-end Android devices" is partly served by Task 6 and 7 removing interaction cost; the payload-size half is explicitly deferred above. The anti-fabrication ethic the nationwide seed violated is Tasks 1–3. Multi-channel delivery that survives the outage is Tasks 8–10. Anti-abuse is untouched — it shipped earlier today and needs nothing here.

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Every code step carries runnable code. Three steps direct the implementer to read an existing file before editing (Task 6 Step 1, Task 7 Step 3, Task 10 Step 6) because the exact local names could not be verified from this session's context — each names what to look for and what to do with it, rather than guessing a line number.

**Type consistency.** `SharedAlert` is defined once in Task 8 and consumed unchanged in Tasks 9 and 10. `hasRealHotline` / `hasRealEvacuationCenter` are defined in Task 1 and consumed in Tasks 2, 3 and 10 under those exact names. `addWaterLevelReport` gains a return value in Task 6 Step 5, which is the only signature change to existing code; existing callers ignore returns and are unaffected.

**Review Focus coverage.** Non-ASCII encoding → Task 8. Truncated payload → Task 8 and Task 9. Unknown zone on the recipient's device → Task 9. Undo after delivery → Task 6. Malformed-but-real hotline → Task 1.
