# Hi-Fi Citizen App (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 (`hi-fi` branch) citizen app UI — alert screen, evacuation instructions, water-level report form with the depth-reference visual, zone onboarding, consent notice, and zone map — all running on mock data, no backend.

**Architecture:** Next.js App Router pages compose small, feature-scoped components under `src/features/*` and shared domain logic under `src/lib/*`. Severity and depth-level logic is centralized in two pure-function modules so the alert badge, the depth visual, and the map shading all read from one source of truth, per the PRD's architecture note.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, Vitest + React Testing Library for unit tests.

**Spec:** [PRD.md](../../../PRD.md) (also mirrored at [docs/superpowers/specs/2026-09-01-citizen-app-phase1-design.md](../specs/2026-09-01-citizen-app-phase1-design.md))

## Global Constraints

- Dark-mode-default UI (PRD: Power & Battery Considerations) — the app must render in dark mode without depending on OS `prefers-color-scheme`.
- Severity color system (Yellow/Orange/Red/Evacuate) is the single visual language across alert badges, the depth visual, and map shading — no separate decorative palette (PRD: Design Language & Crisis UX).
- No custom webfonts — system font stack only (PRD: Design Language & Crisis UX, also serves low-bandwidth requirement).
- Depth scale is exactly: `dry`, `ankle`, `knee`, `waist`, `neck` (PRD: Core Features #4).
- Depth-reference visual shows an adult figure and a child figure side by side, colored through the severity scale — never framed as distress/drowning imagery (PRD: Design Language & Crisis UX).
- All data in this phase is mock/static — no Supabase, no real network calls (PRD: Implementation Phases, Phase 1).
- Consent notice (RA 10173) ships in this phase, not deferred (PRD: Privacy & Consent).
- Large touch targets, minimal text, progressive disclosure — one primary action per screen (PRD: Design Language & Crisis UX).

---

### Task 1: Testing infrastructure + shadcn/ui + high-contrast theme tokens

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (add `test`/`test:watch` scripts and devDependencies)
- Modify: `src/app/globals.css` (severity color tokens, dark-mode-default)
- Create: `components.json` (via shadcn init)
- Create: `src/lib/utils.ts` (via shadcn init)

**Interfaces:**
- Produces: Tailwind CSS custom properties `--color-severity-yellow`, `--color-severity-orange`, `--color-severity-red`, `--color-severity-evacuate`, consumed by Task 2's `severity.ts` class-name maps.

- [ ] **Step 1: Install Vitest and React Testing Library**

Run:
```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Create `vitest.setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Add test scripts to package.json**

Modify `package.json` scripts block to:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

- [ ] **Step 4: Verify the test runner works with a throwaway test**

Create `src/lib/sanity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: PASS, 1 test passed.

Delete `src/lib/sanity.test.ts` once confirmed (it was only to verify the runner).

- [ ] **Step 5: Initialize shadcn/ui**

Run:
```bash
npx shadcn@latest init -y -b neutral
```

This creates `components.json` and `src/lib/utils.ts`, and adds a shadcn CSS variable layer to `src/app/globals.css`.

- [ ] **Step 6: Add the severity color tokens and dark-mode-default to globals.css**

Modify `src/app/globals.css` — after the block shadcn's init added, append:

```css
@theme inline {
  --color-severity-yellow: #eab308;
  --color-severity-orange: #f97316;
  --color-severity-red: #dc2626;
  --color-severity-evacuate: #7f1d1d;
}
```

Then find the `:root` block shadcn generated and the `.dark` block it generated. Replace the `:root` block's values with the `.dark` block's values (so the default, unclassed root is already the dark palette), and keep the `.dark` class block as-is for explicitness. This makes dark the default without depending on `prefers-color-scheme` or a class toggle, satisfying the Global Constraint above.

Also find the `--font-sans`/`--font-mono` lines shadcn's init generated in the `@theme inline` block (they'll reference Geist font CSS variables) and replace them with a system font stack, since the Global Constraint above rules out custom webfonts:

```css
--font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts components.json src/lib/utils.ts src/app/globals.css
git commit -m "chore: add Vitest, shadcn/ui, and high-contrast dark-default theme tokens"
```

---

### Task 2: Severity and depth domain logic

**Files:**
- Create: `src/lib/severity.ts`
- Create: `src/lib/severity.test.ts`
- Create: `src/lib/depth.ts`
- Create: `src/lib/depth.test.ts`

**Interfaces:**
- Consumes: Tailwind tokens `--color-severity-*` from Task 1.
- Produces: `Severity` type, `SEVERITY_LABEL`, `SEVERITY_BADGE_CLASS: Record<Severity, string>`, `DepthLevel` type, `DEPTH_LEVELS: DepthLevel[]`, `DEPTH_LABEL`, `DEPTH_SEVERITY: Record<DepthLevel, Severity>`, `depthFillPercent(depthCm: number, figureHeightCm: number): number`, `DEPTH_CM: Record<DepthLevel, number>`. All consumed by Tasks 5–8.

- [ ] **Step 1: Write the failing tests for severity.ts**

Create `src/lib/severity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { SEVERITY_LABEL, SEVERITY_BADGE_CLASS, SEVERITY_ORDER } from "./severity";

describe("severity", () => {
  it("orders severities from least to most urgent", () => {
    expect(SEVERITY_ORDER).toEqual(["yellow", "orange", "red", "evacuate"]);
  });

  it("labels every severity", () => {
    expect(SEVERITY_LABEL.yellow).toBe("Advisory");
    expect(SEVERITY_LABEL.orange).toBe("Watch");
    expect(SEVERITY_LABEL.red).toBe("Warning");
    expect(SEVERITY_LABEL.evacuate).toBe("Evacuate Now");
  });

  it("maps every severity to a badge class containing its color token", () => {
    expect(SEVERITY_BADGE_CLASS.yellow).toContain("severity-yellow");
    expect(SEVERITY_BADGE_CLASS.orange).toContain("severity-orange");
    expect(SEVERITY_BADGE_CLASS.red).toContain("severity-red");
    expect(SEVERITY_BADGE_CLASS.evacuate).toContain("severity-evacuate");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- severity`
Expected: FAIL with "Cannot find module './severity'"

- [ ] **Step 3: Implement severity.ts**

Create `src/lib/severity.ts`:

```typescript
export type Severity = "yellow" | "orange" | "red" | "evacuate";

export const SEVERITY_ORDER: Severity[] = ["yellow", "orange", "red", "evacuate"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  yellow: "Advisory",
  orange: "Watch",
  red: "Warning",
  evacuate: "Evacuate Now",
};

export const SEVERITY_BADGE_CLASS: Record<Severity, string> = {
  yellow: "bg-severity-yellow text-black border-severity-yellow",
  orange: "bg-severity-orange text-black border-severity-orange",
  red: "bg-severity-red text-white border-severity-red",
  evacuate: "bg-severity-evacuate text-white border-severity-evacuate",
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- severity`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Write the failing tests for depth.ts**

Create `src/lib/depth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { DEPTH_LEVELS, DEPTH_LABEL, DEPTH_CM, DEPTH_SEVERITY, depthFillPercent } from "./depth";

describe("depth", () => {
  it("orders depth levels from dry to neck", () => {
    expect(DEPTH_LEVELS).toEqual(["dry", "ankle", "knee", "waist", "neck"]);
  });

  it("labels every depth level", () => {
    expect(DEPTH_LABEL.dry).toBe("Dry");
    expect(DEPTH_LABEL.ankle).toBe("Ankle-deep");
    expect(DEPTH_LABEL.knee).toBe("Knee-deep");
    expect(DEPTH_LABEL.waist).toBe("Waist-deep");
    expect(DEPTH_LABEL.neck).toBe("Neck-deep");
  });

  it("maps each depth level to a cm estimate matching the PRD scale", () => {
    expect(DEPTH_CM.dry).toBe(0);
    expect(DEPTH_CM.ankle).toBe(15);
    expect(DEPTH_CM.knee).toBe(45);
    expect(DEPTH_CM.waist).toBe(90);
    expect(DEPTH_CM.neck).toBe(150);
  });

  it("maps each depth level to a severity matching the PRD auto-trigger rule", () => {
    expect(DEPTH_SEVERITY.waist).toBe("red");
    expect(DEPTH_SEVERITY.neck).toBe("evacuate");
  });

  describe("depthFillPercent", () => {
    it("returns 0 for no water", () => {
      expect(depthFillPercent(0, 170)).toBe(0);
    });

    it("returns a proportional fill for a mid-range depth", () => {
      expect(depthFillPercent(85, 170)).toBe(50);
    });

    it("clamps at 100 when depth exceeds figure height", () => {
      expect(depthFillPercent(300, 170)).toBe(100);
    });

    it("never returns a negative value", () => {
      expect(depthFillPercent(-10, 170)).toBe(0);
    });
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- depth`
Expected: FAIL with "Cannot find module './depth'"

- [ ] **Step 7: Implement depth.ts**

Create `src/lib/depth.ts`:

```typescript
import type { Severity } from "./severity";

export type DepthLevel = "dry" | "ankle" | "knee" | "waist" | "neck";

export const DEPTH_LEVELS: DepthLevel[] = ["dry", "ankle", "knee", "waist", "neck"];

export const DEPTH_LABEL: Record<DepthLevel, string> = {
  dry: "Dry",
  ankle: "Ankle-deep",
  knee: "Knee-deep",
  waist: "Waist-deep",
  neck: "Neck-deep",
};

export const DEPTH_CM: Record<DepthLevel, number> = {
  dry: 0,
  ankle: 15,
  knee: 45,
  waist: 90,
  neck: 150,
};

export const DEPTH_SEVERITY: Record<DepthLevel, Severity> = {
  dry: "yellow",
  ankle: "yellow",
  knee: "orange",
  waist: "red",
  neck: "evacuate",
};

export function depthFillPercent(depthCm: number, figureHeightCm: number): number {
  const percent = (depthCm / figureHeightCm) * 100;
  return Math.max(0, Math.min(100, percent));
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npm test -- depth`
Expected: PASS, 9 tests passed.

- [ ] **Step 9: Commit**

```bash
git add src/lib/severity.ts src/lib/severity.test.ts src/lib/depth.ts src/lib/depth.test.ts
git commit -m "feat: add severity and depth domain logic"
```

---

### Task 3: Shared types and mock data

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/mock-data.ts`

**Interfaces:**
- Consumes: `Severity` from `src/lib/severity.ts`, `DepthLevel` from `src/lib/depth.ts`.
- Produces: `Zone`, `AlertRecord` types; `MOCK_ZONES: Zone[]`, `MOCK_ALERTS: AlertRecord[]`, `getActiveAlertForZone(zoneId: string): AlertRecord | undefined`. Consumed by Tasks 5, 6, 8, 9, 10.

- [ ] **Step 1: Write the failing test**

Create `src/lib/mock-data.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { MOCK_ZONES, MOCK_ALERTS, getActiveAlertForZone } from "./mock-data";

describe("mock-data", () => {
  it("has at least one zone with all required fields", () => {
    expect(MOCK_ZONES.length).toBeGreaterThan(0);
    const zone = MOCK_ZONES[0];
    expect(zone.id).toBeTruthy();
    expect(zone.name).toBeTruthy();
    expect(zone.evacuationCenterName).toBeTruthy();
    expect(zone.evacuationRouteText).toBeTruthy();
    expect(zone.hotlineNumber).toBeTruthy();
  });

  it("returns the active alert for a zone that has one", () => {
    const zone = MOCK_ZONES[0];
    const alert = getActiveAlertForZone(zone.id);
    expect(alert).toBeDefined();
    expect(alert?.zoneId).toBe(zone.id);
    expect(alert?.isActive).toBe(true);
  });

  it("returns undefined for a zone with no active alert", () => {
    expect(getActiveAlertForZone("nonexistent-zone")).toBeUndefined();
  });

  it("every mock alert references a real mock zone", () => {
    const zoneIds = new Set(MOCK_ZONES.map((z) => z.id));
    for (const alert of MOCK_ALERTS) {
      expect(zoneIds.has(alert.zoneId)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- mock-data`
Expected: FAIL with "Cannot find module './mock-data'"

- [ ] **Step 3: Write types.ts**

Create `src/lib/types.ts`:

```typescript
import type { Severity } from "./severity";

export interface Zone {
  id: string;
  psgcBarangayCode: string;
  name: string;
  evacuationCenterName: string;
  evacuationRouteText: string;
  hotlineNumber: string;
}

export interface AlertRecord {
  id: string;
  zoneId: string;
  severity: Severity;
  message: string;
  issuedAt: string;
  isActive: boolean;
}
```

- [ ] **Step 4: Write mock-data.ts**

Create `src/lib/mock-data.ts`:

```typescript
import type { Zone, AlertRecord } from "./types";

export const MOCK_ZONES: Zone[] = [
  {
    id: "zone-1",
    psgcBarangayCode: "137404001",
    name: "Barangay San Isidro",
    evacuationCenterName: "San Isidro Elementary School",
    evacuationRouteText:
      "Head to Rizal St., then straight ahead to the school gym on your right.",
    hotlineNumber: "09171234567",
  },
];

export const MOCK_ALERTS: AlertRecord[] = [
  {
    id: "alert-1",
    zoneId: "zone-1",
    severity: "orange",
    message:
      "Water levels rising near Barangay San Isidro. Monitor conditions and prepare to evacuate.",
    issuedAt: new Date().toISOString(),
    isActive: true,
  },
];

export function getActiveAlertForZone(zoneId: string): AlertRecord | undefined {
  return MOCK_ALERTS.find((alert) => alert.zoneId === zoneId && alert.isActive);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- mock-data`
Expected: PASS, 4 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/mock-data.ts src/lib/mock-data.test.ts
git commit -m "feat: add shared zone/alert types and mock data"
```

---

### Task 4: Root layout — dark-mode-default and emergency hotline button

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/components/emergency-hotline-button.tsx`
- Create: `src/components/emergency-hotline-button.test.tsx`

**Interfaces:**
- Consumes: `MOCK_ZONES` from `src/lib/mock-data.ts` (uses `MOCK_ZONES[0].hotlineNumber` for this phase, since onboarding-selected zone isn't wired to state until Task 5).
- Produces: `<EmergencyHotlineButton hotlineNumber={string} />`, rendered globally in the root layout, consumed by no later task but must remain present on every screen per PRD Core Feature #7.

- [ ] **Step 1: Write the failing test**

Create `src/components/emergency-hotline-button.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmergencyHotlineButton } from "./emergency-hotline-button";

describe("EmergencyHotlineButton", () => {
  it("renders a tel: link with the given hotline number", () => {
    render(<EmergencyHotlineButton hotlineNumber="09171234567" />);
    const link = screen.getByRole("link", { name: /emergency hotline/i });
    expect(link).toHaveAttribute("href", "tel:09171234567");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- emergency-hotline-button`
Expected: FAIL with "Cannot find module './emergency-hotline-button'"

- [ ] **Step 3: Implement the component**

Create `src/components/emergency-hotline-button.tsx`:

```typescript
import { Phone } from "lucide-react";

export function EmergencyHotlineButton({ hotlineNumber }: { hotlineNumber: string }) {
  return (
    <a
      href={`tel:${hotlineNumber}`}
      aria-label="Call emergency hotline"
      className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-severity-red text-white shadow-lg"
    >
      <Phone className="h-6 w-6" aria-hidden="true" />
    </a>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- emergency-hotline-button`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Wire it into the root layout with dark-mode-default**

Modify `src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import "./globals.css";
import { EmergencyHotlineButton } from "@/components/emergency-hotline-button";
import { MOCK_ZONES } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "WeatherWell",
  description: "Offline-capable flood alerts and evacuation guidance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
        <EmergencyHotlineButton hotlineNumber={MOCK_ZONES[0].hotlineNumber} />
      </body>
    </html>
  );
}
```

No `next/font/google` import here — the system font stack comes from the `--font-sans` token set in Task 1, applied via Tailwind's `font-sans` utility.

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/components/emergency-hotline-button.tsx src/components/emergency-hotline-button.test.tsx
git commit -m "feat: add dark-mode-default layout and emergency hotline button"
```

---

### Task 5: Consent notice and zone onboarding

**Files:**
- Create: `src/features/onboarding/consent-notice.tsx`
- Create: `src/features/onboarding/consent-notice.test.tsx`
- Create: `src/features/onboarding/zone-picker.tsx`
- Create: `src/features/onboarding/zone-picker.test.tsx`
- Create: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `MOCK_ZONES` from `src/lib/mock-data.ts`, `Zone` type from `src/lib/types.ts`.
- Produces: `<ConsentNotice onAccept={() => void} />`, `<ZonePicker zones={Zone[]} onSelect={(zoneId: string) => void} />`. Consumed by `src/app/onboarding/page.tsx` only in this phase (zone selection isn't persisted to global state until a later phase's data layer exists).

- [ ] **Step 1: Write the failing test for ConsentNotice**

Create `src/features/onboarding/consent-notice.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentNotice } from "./consent-notice";

describe("ConsentNotice", () => {
  it("shows what data is collected and why", () => {
    render(<ConsentNotice onAccept={() => {}} />);
    expect(screen.getByText(/location/i)).toBeInTheDocument();
    expect(screen.getByText(/phone number/i)).toBeInTheDocument();
  });

  it("calls onAccept when the accept button is clicked", async () => {
    const onAccept = vi.fn();
    render(<ConsentNotice onAccept={onAccept} />);
    await userEvent.click(screen.getByRole("button", { name: /i understand/i }));
    expect(onAccept).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- consent-notice`
Expected: FAIL with "Cannot find module './consent-notice'"

- [ ] **Step 3: Install the userEvent dependency and shadcn Button/Card**

Run:
```bash
npm install -D @testing-library/user-event
npx shadcn@latest add button card badge dialog radio-group label -y
```

- [ ] **Step 4: Implement ConsentNotice**

Create `src/features/onboarding/consent-notice.tsx`:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ConsentNotice({ onAccept }: { onAccept: () => void }) {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Before you continue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>
          WeatherWell asks for your <strong>location</strong> to match you to your
          barangay zone and confirm water-level reports come from where you say. Your
          location is never stored beyond what&apos;s needed to validate a report.
        </p>
        <p>
          WeatherWell also asks for your <strong>phone number</strong> to verify you&apos;re
          a real resident and to send SMS alerts if your connection drops. Your number is
          stored securely and never shared.
        </p>
        <p>You can decline either and still see public alerts for your area.</p>
        <Button onClick={onAccept} className="w-full">
          I understand
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- consent-notice`
Expected: PASS, 2 tests passed.

- [ ] **Step 6: Write the failing test for ZonePicker**

Create `src/features/onboarding/zone-picker.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZonePicker } from "./zone-picker";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("ZonePicker", () => {
  beforeEach(() => {
    // jsdom has no geolocation API by default; stub it per test.
    Object.defineProperty(global.navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });
  });

  it("lists every zone by name", () => {
    render(<ZonePicker zones={MOCK_ZONES} onSelect={() => {}} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("calls onSelect with the chosen zone's id via manual selection", async () => {
    const onSelect = vi.fn();
    render(<ZonePicker zones={MOCK_ZONES} onSelect={onSelect} />);
    await userEvent.click(screen.getByText(MOCK_ZONES[0].name));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onSelect).toHaveBeenCalledWith(MOCK_ZONES[0].id);
  });

  it("auto-detects a zone via geolocation and selects it when granted", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 14.6, longitude: 121.0 },
      } as GeolocationPosition);
    });
    Object.defineProperty(global.navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    render(<ZonePicker zones={MOCK_ZONES} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(getCurrentPosition).toHaveBeenCalled();
    expect(await screen.findByText(/detected/i)).toBeInTheDocument();
  });

  it("falls back to the manual list when geolocation is denied", async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({ code: 1, message: "denied" } as GeolocationPositionError);
      }
    );
    Object.defineProperty(global.navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    render(<ZonePicker zones={MOCK_ZONES} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(await screen.findByText(/couldn.t detect/i)).toBeInTheDocument();
    expect(screen.getByText(MOCK_ZONES[0].name)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npm test -- zone-picker`
Expected: FAIL with "Cannot find module './zone-picker'"

- [ ] **Step 8: Implement ZonePicker**

Create `src/features/onboarding/zone-picker.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Zone } from "@/lib/types";

type DetectionState = "idle" | "detecting" | "detected" | "failed";

export function ZonePicker({
  zones,
  onSelect,
}: {
  zones: Zone[];
  onSelect: (zoneId: string) => void;
}) {
  const [selected, setSelected] = useState<string | undefined>(zones[0]?.id);
  const [detection, setDetection] = useState<DetectionState>("idle");

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setDetection("failed");
      return;
    }

    setDetection("detecting");
    navigator.geolocation.getCurrentPosition(
      () => {
        // Phase 1 has one mock zone and no real boundary-matching yet
        // (that ships with the real GeoRisk/PSGC data in Phase 2), so a
        // successful fix just confirms the only zone we know about.
        setSelected(zones[0]?.id);
        setDetection("detected");
      },
      () => {
        setDetection("failed");
      }
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Select your barangay so alerts and evacuation instructions match your area.
      </p>
      <Button type="button" variant="outline" onClick={handleUseMyLocation}>
        Use my location
      </Button>
      {detection === "detected" && (
        <p className="text-sm">
          Detected zone: {zones.find((z) => z.id === selected)?.name}
        </p>
      )}
      {detection === "failed" && (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t detect your zone automatically — pick it below.
        </p>
      )}
      <RadioGroup value={selected} onValueChange={setSelected}>
        {zones.map((zone) => (
          <div key={zone.id} className="flex items-center space-x-2">
            <RadioGroupItem value={zone.id} id={zone.id} />
            <Label htmlFor={zone.id}>{zone.name}</Label>
          </div>
        ))}
      </RadioGroup>
      <Button
        className="w-full"
        disabled={!selected}
        onClick={() => selected && onSelect(selected)}
      >
        Confirm zone
      </Button>
    </div>
  );
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `npm test -- zone-picker`
Expected: PASS, 4 tests passed.

- [ ] **Step 10: Wire both into the onboarding page**

Create `src/app/onboarding/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConsentNotice } from "@/features/onboarding/consent-notice";
import { ZonePicker } from "@/features/onboarding/zone-picker";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function OnboardingPage() {
  const [consented, setConsented] = useState(false);
  const router = useRouter();

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-8 p-6">
      {!consented ? (
        <ConsentNotice onAccept={() => setConsented(true)} />
      ) : (
        <ZonePicker
          zones={MOCK_ZONES}
          onSelect={(zoneId) => router.push(`/?zone=${zoneId}`)}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add src/features/onboarding src/app/onboarding package.json package-lock.json src/components/ui
git commit -m "feat: add consent notice and zone onboarding"
```

---

### Task 6: Alert screen (home page)

**Files:**
- Create: `src/features/alerts/severity-badge.tsx`
- Create: `src/features/alerts/severity-badge.test.tsx`
- Create: `src/features/alerts/alert-card.tsx`
- Create: `src/features/alerts/alert-card.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `Severity`, `SEVERITY_LABEL`, `SEVERITY_BADGE_CLASS` from `src/lib/severity.ts`; `AlertRecord`, `Zone` from `src/lib/types.ts`; `MOCK_ZONES`, `getActiveAlertForZone` from `src/lib/mock-data.ts`.
- Produces: `<SeverityBadge severity={Severity} />`, `<AlertCard alert={AlertRecord} zone={Zone} />`. Consumed by `src/app/page.tsx`.

- [ ] **Step 1: Write the failing test for SeverityBadge**

Create `src/features/alerts/severity-badge.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeverityBadge } from "./severity-badge";

describe("SeverityBadge", () => {
  it("shows the human-readable label for the severity", () => {
    render(<SeverityBadge severity="red" />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("applies the red severity color class", () => {
    render(<SeverityBadge severity="red" />);
    expect(screen.getByText("Warning")).toHaveClass("bg-severity-red");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- severity-badge`
Expected: FAIL with "Cannot find module './severity-badge'"

- [ ] **Step 3: Implement SeverityBadge**

Create `src/features/alerts/severity-badge.tsx`:

```typescript
import { Badge } from "@/components/ui/badge";
import { SEVERITY_LABEL, SEVERITY_BADGE_CLASS, type Severity } from "@/lib/severity";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge className={SEVERITY_BADGE_CLASS[severity]}>{SEVERITY_LABEL[severity]}</Badge>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- severity-badge`
Expected: PASS, 2 tests passed.

- [ ] **Step 5: Write the failing test for AlertCard**

Create `src/features/alerts/alert-card.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertCard } from "./alert-card";
import { MOCK_ZONES, MOCK_ALERTS } from "@/lib/mock-data";

describe("AlertCard", () => {
  const zone = MOCK_ZONES[0];
  const alert = MOCK_ALERTS[0];

  it("shows the zone name, severity, and message", () => {
    render(<AlertCard alert={alert} zone={zone} />);
    expect(screen.getByText(zone.name)).toBeInTheDocument();
    expect(screen.getByText(alert.message)).toBeInTheDocument();
  });

  it("shows a 'no active alert' state when alert is undefined", () => {
    render(<AlertCard alert={undefined} zone={zone} />);
    expect(screen.getByText(/no active alert/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- alert-card`
Expected: FAIL with "Cannot find module './alert-card'"

- [ ] **Step 7: Implement AlertCard**

Create `src/features/alerts/alert-card.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "./severity-badge";
import type { AlertRecord, Zone } from "@/lib/types";

export function AlertCard({
  alert,
  zone,
}: {
  alert: AlertRecord | undefined;
  zone: Zone;
}) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{zone.name}</CardTitle>
        {alert && <SeverityBadge severity={alert.severity} />}
      </CardHeader>
      <CardContent>
        {alert ? (
          <p>{alert.message}</p>
        ) : (
          <p className="text-muted-foreground">No active alert for this zone.</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npm test -- alert-card`
Expected: PASS, 2 tests passed.

- [ ] **Step 9: Wire into the home page**

Modify `src/app/page.tsx`:

```typescript
import Link from "next/link";
import { AlertCard } from "@/features/alerts/alert-card";
import { Button } from "@/components/ui/button";
import { MOCK_ZONES, getActiveAlertForZone } from "@/lib/mock-data";

export default function Home() {
  const zone = MOCK_ZONES[0];
  const alert = getActiveAlertForZone(zone.id);

  return (
    <main className="flex min-h-full flex-col items-center gap-6 p-6 pt-16">
      <AlertCard alert={alert} zone={zone} />
      <div className="flex w-full max-w-md flex-col gap-3">
        <Button asChild size="lg">
          <Link href="/evacuation">View evacuation instructions</Link>
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/report">Report water level</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/map">View zone map</Link>
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 10: Commit**

```bash
git add src/features/alerts src/app/page.tsx
git commit -m "feat: add alert screen with severity badge and alert card"
```

---

### Task 7: Depth-reference visual

**Files:**
- Create: `src/features/water-level-report/depth-reference-visual.tsx`
- Create: `src/features/water-level-report/depth-reference-visual.test.tsx`

**Interfaces:**
- Consumes: `DepthLevel`, `DEPTH_CM`, `DEPTH_SEVERITY`, `depthFillPercent` from `src/lib/depth.ts`; `SEVERITY_BADGE_CLASS`-adjacent fill colors keyed off `src/lib/severity.ts`.
- Produces: `<DepthReferenceVisual depthLevel={DepthLevel} />`. Consumed by Task 8's report form.

- [ ] **Step 1: Write the failing test**

Create `src/features/water-level-report/depth-reference-visual.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DepthReferenceVisual } from "./depth-reference-visual";

describe("DepthReferenceVisual", () => {
  it("renders both an adult and a child reference figure", () => {
    render(<DepthReferenceVisual depthLevel="knee" />);
    expect(screen.getByLabelText(/adult reference figure/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/child reference figure/i)).toBeInTheDocument();
  });

  it("increases the fill height for deeper levels", () => {
    const { rerender, container } = render(<DepthReferenceVisual depthLevel="ankle" />);
    const ankleFill = container.querySelector('[data-testid="adult-fill"]');
    const ankleHeight = Number(ankleFill?.getAttribute("height"));

    rerender(<DepthReferenceVisual depthLevel="neck" />);
    const neckFill = container.querySelector('[data-testid="adult-fill"]');
    const neckHeight = Number(neckFill?.getAttribute("height"));

    expect(neckHeight).toBeGreaterThan(ankleHeight);
  });

  it("shows the depth label", () => {
    render(<DepthReferenceVisual depthLevel="waist" />);
    expect(screen.getByText("Waist-deep")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- depth-reference-visual`
Expected: FAIL with "Cannot find module './depth-reference-visual'"

- [ ] **Step 3: Implement DepthReferenceVisual**

Create `src/features/water-level-report/depth-reference-visual.tsx`:

```typescript
import { DEPTH_CM, DEPTH_LABEL, DEPTH_SEVERITY, depthFillPercent, type DepthLevel } from "@/lib/depth";

const ADULT_HEIGHT_CM = 170;
const CHILD_HEIGHT_CM = 110;
const FIGURE_PX_HEIGHT = 120;

const SEVERITY_FILL_COLOR: Record<string, string> = {
  yellow: "var(--color-severity-yellow)",
  orange: "var(--color-severity-orange)",
  red: "var(--color-severity-red)",
  evacuate: "var(--color-severity-evacuate)",
};

function Figure({
  label,
  fillPercent,
  color,
  testId,
}: {
  label: string;
  fillPercent: number;
  color: string;
  testId: string;
}) {
  const fillHeight = (fillPercent / 100) * FIGURE_PX_HEIGHT;

  return (
    <svg
      role="img"
      aria-label={label}
      width="60"
      height={FIGURE_PX_HEIGHT}
      viewBox={`0 0 60 ${FIGURE_PX_HEIGHT}`}
    >
      <rect
        x="10"
        y="0"
        width="40"
        height={FIGURE_PX_HEIGHT}
        rx="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        data-testid={testId}
        x="10"
        y={FIGURE_PX_HEIGHT - fillHeight}
        width="40"
        height={fillHeight}
        rx="20"
        fill={color}
      />
    </svg>
  );
}

export function DepthReferenceVisual({ depthLevel }: { depthLevel: DepthLevel }) {
  const depthCm = DEPTH_CM[depthLevel];
  const severity = DEPTH_SEVERITY[depthLevel];
  const color = SEVERITY_FILL_COLOR[severity];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-end gap-6">
        <Figure
          label="Adult reference figure"
          fillPercent={depthFillPercent(depthCm, ADULT_HEIGHT_CM)}
          color={color}
          testId="adult-fill"
        />
        <Figure
          label="Child reference figure"
          fillPercent={depthFillPercent(depthCm, CHILD_HEIGHT_CM)}
          color={color}
          testId="child-fill"
        />
      </div>
      <p className="text-sm font-medium">{DEPTH_LABEL[depthLevel]}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- depth-reference-visual`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/water-level-report/depth-reference-visual.tsx src/features/water-level-report/depth-reference-visual.test.tsx
git commit -m "feat: add depth-reference visual (adult/child silhouettes)"
```

---

### Task 8: Water-level report form

**Files:**
- Create: `src/features/water-level-report/report-form.tsx`
- Create: `src/features/water-level-report/report-form.test.tsx`
- Create: `src/app/report/page.tsx`

**Interfaces:**
- Consumes: `DepthReferenceVisual` from Task 7; `DEPTH_LEVELS`, `DEPTH_LABEL`, `DepthLevel` from `src/lib/depth.ts`; `MOCK_ZONES` from `src/lib/mock-data.ts`.
- Produces: `<ReportForm zoneId={string} onSubmit={(depthLevel: DepthLevel) => void} />`. Consumed by `src/app/report/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/features/water-level-report/report-form.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportForm } from "./report-form";

describe("ReportForm", () => {
  it("lets the user pick a depth level and submit it", async () => {
    const onSubmit = vi.fn();
    render(<ReportForm zoneId="zone-1" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByLabelText("Waist-deep"));
    await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

    expect(onSubmit).toHaveBeenCalledWith("waist");
  });

  it("defaults to dry and updates the visual preview on selection", async () => {
    render(<ReportForm zoneId="zone-1" onSubmit={() => {}} />);
    expect(screen.getAllByText("Dry").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByLabelText("Neck-deep"));
    expect(screen.getAllByText("Neck-deep").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- report-form`
Expected: FAIL with "Cannot find module './report-form'"

- [ ] **Step 3: Implement ReportForm**

Create `src/features/water-level-report/report-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DepthReferenceVisual } from "./depth-reference-visual";
import { DEPTH_LEVELS, DEPTH_LABEL, type DepthLevel } from "@/lib/depth";

export function ReportForm({
  zoneId,
  onSubmit,
}: {
  zoneId: string;
  onSubmit: (depthLevel: DepthLevel) => void;
}) {
  const [depthLevel, setDepthLevel] = useState<DepthLevel>("dry");

  return (
    <form
      className="flex w-full max-w-md flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(depthLevel);
      }}
    >
      <input type="hidden" name="zoneId" value={zoneId} />
      <DepthReferenceVisual depthLevel={depthLevel} />
      <RadioGroup
        value={depthLevel}
        onValueChange={(value) => setDepthLevel(value as DepthLevel)}
      >
        {DEPTH_LEVELS.map((level) => (
          <div key={level} className="flex items-center space-x-2">
            <RadioGroupItem value={level} id={level} />
            <Label htmlFor={level}>{DEPTH_LABEL[level]}</Label>
          </div>
        ))}
      </RadioGroup>
      <Button type="submit" size="lg">
        Submit report
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- report-form`
Expected: PASS, 2 tests passed.

- [ ] **Step 5: Wire into the report page**

Create `src/app/report/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { ReportForm } from "@/features/water-level-report/report-form";
import { MOCK_ZONES } from "@/lib/mock-data";
import type { DepthLevel } from "@/lib/depth";

export default function ReportPage() {
  const [submitted, setSubmitted] = useState<DepthLevel | null>(null);
  const zone = MOCK_ZONES[0];

  return (
    <main className="flex min-h-full flex-col items-center gap-6 p-6 pt-16">
      <h1 className="text-lg font-semibold">Report water level — {zone.name}</h1>
      {submitted ? (
        <p role="status">Thanks — your {submitted} report was recorded (mock, Phase 1).</p>
      ) : (
        <ReportForm zoneId={zone.id} onSubmit={setSubmitted} />
      )}
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/water-level-report/report-form.tsx src/features/water-level-report/report-form.test.tsx src/app/report/page.tsx
git commit -m "feat: add water-level report form"
```

---

### Task 9: Evacuation instructions screen

**Files:**
- Create: `src/features/evacuation/evacuation-instructions.tsx`
- Create: `src/features/evacuation/evacuation-instructions.test.tsx`
- Create: `src/app/evacuation/page.tsx`

**Interfaces:**
- Consumes: `Zone` from `src/lib/types.ts`, `MOCK_ZONES` from `src/lib/mock-data.ts`.
- Produces: `<EvacuationInstructions zone={Zone} />`. Consumed by `src/app/evacuation/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/features/evacuation/evacuation-instructions.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvacuationInstructions } from "./evacuation-instructions";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("EvacuationInstructions", () => {
  it("shows the evacuation center name and route text", () => {
    const zone = MOCK_ZONES[0];
    render(<EvacuationInstructions zone={zone} />);
    expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
    expect(screen.getByText(zone.evacuationRouteText)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- evacuation-instructions`
Expected: FAIL with "Cannot find module './evacuation-instructions'"

- [ ] **Step 3: Implement EvacuationInstructions**

Create `src/features/evacuation/evacuation-instructions.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Zone } from "@/lib/types";

export function EvacuationInstructions({ zone }: { zone: Zone }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{zone.evacuationCenterName}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{zone.evacuationRouteText}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- evacuation-instructions`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Wire into the evacuation page**

Create `src/app/evacuation/page.tsx`:

```typescript
import { EvacuationInstructions } from "@/features/evacuation/evacuation-instructions";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function EvacuationPage() {
  const zone = MOCK_ZONES[0];

  return (
    <main className="flex min-h-full flex-col items-center gap-6 p-6 pt-16">
      <h1 className="text-lg font-semibold">Evacuation instructions — {zone.name}</h1>
      <EvacuationInstructions zone={zone} />
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/evacuation src/app/evacuation
git commit -m "feat: add evacuation instructions screen"
```

---

### Task 10: Zone map screen, accessibility pass, and Vercel preview

**Files:**
- Create: `src/features/zones/zone-map.tsx`
- Create: `src/features/zones/zone-map.test.tsx`
- Create: `src/app/map/page.tsx`

**Interfaces:**
- Consumes: `Zone` from `src/lib/types.ts`, `MOCK_ZONES` from `src/lib/mock-data.ts`.
- Produces: `<ZoneMap zones={Zone[]} />`. This is the final task — nothing downstream depends on it.

- [ ] **Step 1: Write the failing test**

Create `src/features/zones/zone-map.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZoneMap } from "./zone-map";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("ZoneMap", () => {
  it("renders a labeled region for each zone", () => {
    render(<ZoneMap zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- zone-map`
Expected: FAIL with "Cannot find module './zone-map'"

- [ ] **Step 3: Implement ZoneMap (placeholder layout — real boundary data is Phase 2)**

Create `src/features/zones/zone-map.tsx`:

```typescript
import type { Zone } from "@/lib/types";

export function ZoneMap({ zones }: { zones: Zone[] }) {
  return (
    <div className="grid w-full max-w-md gap-3">
      {zones.map((zone) => (
        <div
          key={zone.id}
          className="rounded-md border-2 border-foreground/20 p-4"
        >
          <p className="font-medium">{zone.name}</p>
          <p className="text-sm text-muted-foreground">{zone.evacuationCenterName}</p>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Real barangay boundary data ships in Phase 2 — this is a placeholder layout.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- zone-map`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Wire into the map page**

Create `src/app/map/page.tsx`:

```typescript
import { ZoneMap } from "@/features/zones/zone-map";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function MapPage() {
  return (
    <main className="flex min-h-full flex-col items-center gap-6 p-6 pt-16">
      <h1 className="text-lg font-semibold">Zones</h1>
      <ZoneMap zones={MOCK_ZONES} />
    </main>
  );
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: All tests pass, no failures.

- [ ] **Step 7: Run the production build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/features/zones src/app/map
git commit -m "feat: add zone map screen"
```

- [ ] **Step 9: Push and verify the Vercel preview**

Run: `git push origin hi-fi`

Then confirm the Vercel deployment for `hi-fi` reaches `READY` and manually click through: `/onboarding` → `/` → `/evacuation`, `/report`, `/map`, checking the emergency hotline button appears on every screen and the app renders in dark mode by default.
