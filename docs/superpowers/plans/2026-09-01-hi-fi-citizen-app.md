# Hi-Fi Citizen App (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 (`hi-fi` branch) citizen app UI — alert screen, evacuation instructions, water-level report form with the depth-reference visual, zone onboarding, consent notice, and zone map — all running on mock data, no backend.

**Architecture:** Next.js App Router pages compose small, feature-scoped components under `src/features/*` and shared domain logic under `src/lib/*`. Severity, depth, and contrast logic live in pure-function modules so the alert badge, the depth visual, and the accessibility tests all read from one source of truth. All user-facing zone/alert copy is stored per-language (`LocalizedText`) from day one, matching the PRD's `jsonb` schema so Phase 2's Supabase seed needs no remodelling.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, lucide-react, Vitest + React Testing Library, axe-core.

**Spec:** [PRD.md](../../../PRD.md) (also mirrored at [docs/superpowers/specs/2026-09-01-citizen-app-phase1-design.md](../specs/2026-09-01-citizen-app-phase1-design.md))

## Global Constraints

- **Read the Next.js docs before writing any page/layout code.** This project's `AGENTS.md` mandates it: this Next.js version has breaking changes versus training data. The docs are at `node_modules/next/dist/docs/` (`01-app/` is the relevant tree). Confirm App Router conventions there before hand-writing `layout.tsx` or any `page.tsx`.
- Dark-mode-default UI (PRD: Power & Battery Considerations) — the app must render dark without depending on OS `prefers-color-scheme`.
- Severity color system (Yellow/Orange/Red/Evacuate) is the single visual language across alert badges, the depth visual, and map shading — no separate decorative palette (PRD: Design Language & Crisis UX).
- No custom webfonts — system font stack only (PRD: Design Language & Crisis UX; also serves the low-bandwidth requirement).
- Depth scale is exactly: `dry`, `ankle`, `knee`, `waist`, `neck` (PRD: Core Features #4).
- Depth-reference visual: adult and child figures on a **shared waterline**, child drawn physically shorter, colored through the severity scale — informational, never distress/drowning imagery (PRD: Design Language & Crisis UX).
- All zone/alert user-facing copy is `LocalizedText` (`{ en, fil }`) — never a bare string. Matches the PRD's per-language `jsonb` columns (PRD: Architecture; Accessibility & Inclusion #1).
- All data in this phase is mock/static — no Supabase, no real network calls (PRD: Implementation Phases, Phase 1).
- Consent notice (RA 10173) ships in this phase, not deferred, and the user must actually reach it (PRD: Privacy & Consent).
- Evacuation guidance pairs text with icon/pictogram cues, never text-only (PRD: Accessibility & Inclusion #3).
- Large touch targets, minimal text, progressive disclosure (PRD: Design Language & Crisis UX).

---

### Task 1: Toolchain — tests, shadcn/ui, all UI deps, theme tokens

Everything the later tasks import is installed here, so no later task is blocked mid-TDD-cycle by a missing package.

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (test scripts + devDependencies)
- Modify: `src/app/globals.css` (severity tokens, dark-default palette, system fonts)
- Create: `components.json`, `src/lib/utils.ts` (via shadcn init)
- Create: `src/components/ui/*` (via shadcn add)

**Interfaces:**
- Produces: Tailwind theme tokens `--color-severity-yellow|orange|red|evacuate` (emitted as real CSS custom properties **and** as `bg-severity-*` utilities — verified behaviour of Tailwind v4 `@theme`), consumed by Tasks 2, 4, and 7. Also produces the shadcn `Button`, `Card`, `Badge`, `Label`, `RadioGroup` components consumed by Tasks 5, 6, 8, 9.

- [ ] **Step 1: Read the Next.js App Router docs**

Per `AGENTS.md`, before writing any routing/layout code:

```bash
ls node_modules/next/dist/docs/01-app/
```

Skim the layout and page conventions. Do not skip this — the installed Next.js version differs from training data.

- [ ] **Step 2: Install all test and UI dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event axe-core
```

- [ ] **Step 3: Create the Vitest config**

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

- [ ] **Step 4: Add test scripts to package.json**

Set the `scripts` block to:

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

- [ ] **Step 5: Verify the test runner works**

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

Then delete `src/lib/sanity.test.ts` — it existed only to prove the runner works.

- [ ] **Step 6: Initialize shadcn/ui and add every component this plan uses**

```bash
npx shadcn@latest init -y -b neutral
npx shadcn@latest add button card badge label radio-group -y
```

`init` also installs `lucide-react`, `clsx`, `tailwind-merge`, and `class-variance-authority`. Verify `lucide-react` landed — Task 4 and Task 9 import icons from it:

```bash
ls node_modules/lucide-react
```

If it is missing, install it explicitly: `npm install lucide-react`.

- [ ] **Step 7: Rewrite globals.css with severity tokens, a dark-default palette, and system fonts**

`shadcn init` writes a `:root` (light) block and a `.dark` (dark) block. Phase 1 requires dark to be the default with no OS-preference dependency, so the dark values are promoted into `:root` itself.

Replace the entire contents of `src/app/globals.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}

/* Severity scale — the app's entire color language.
   Contrast ratios against their paired text color are asserted in
   src/lib/contrast.test.ts; do not change these without rerunning it. */
@theme {
  --color-severity-yellow: #eab308;
  --color-severity-orange: #f97316;
  --color-severity-red: #dc2626;
  --color-severity-evacuate: #7f1d1d;
}

/* Dark palette lives on bare :root so dark is the default with no
   prefers-color-scheme dependency and no class toggle required. */
:root {
  --radius: 0.625rem;
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 15%);
  --input: oklch(1 0 0 / 20%);
  --ring: oklch(0.556 0 0);
}

/* Kept so an explicit .dark class stays valid and idempotent. */
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 15%);
  --input: oklch(1 0 0 / 20%);
  --ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

If `shadcn init` generated token names beyond these (e.g. sidebar or chart tokens), keep them — just make sure the `:root` block holds the *dark* values.

- [ ] **Step 8: Verify the build still compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts components.json src/lib/utils.ts src/components/ui src/app/globals.css
git commit -m "chore: add Vitest, shadcn/ui, and high-contrast dark-default theme tokens"
```

---

### Task 2: Severity, depth, and contrast domain logic

**Files:**
- Create: `src/lib/severity.ts`, `src/lib/severity.test.ts`
- Create: `src/lib/depth.ts`, `src/lib/depth.test.ts`
- Create: `src/lib/contrast.ts`, `src/lib/contrast.test.ts`

**Interfaces:**
- Consumes: theme tokens from Task 1.
- Produces: `Severity`, `SEVERITY_ORDER`, `SEVERITY_LABEL`, `SEVERITY_BADGE_CLASS`, `SEVERITY_HEX`, `SEVERITY_TEXT_HEX`; `DepthLevel`, `DEPTH_LEVELS`, `DEPTH_LABEL`, `DEPTH_CM`, `DEPTH_SEVERITY`, `depthFillPercent(depthCm, figureHeightCm)`; `contrastRatio(hexA, hexB)`. Consumed by Tasks 4, 6, 7, 8, 10.

- [ ] **Step 1: Write the failing tests for severity.ts**

Create `src/lib/severity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  SEVERITY_ORDER,
  SEVERITY_LABEL,
  SEVERITY_BADGE_CLASS,
  SEVERITY_HEX,
  SEVERITY_TEXT_HEX,
} from "./severity";

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
    expect(SEVERITY_BADGE_CLASS.yellow).toContain("bg-severity-yellow");
    expect(SEVERITY_BADGE_CLASS.orange).toContain("bg-severity-orange");
    expect(SEVERITY_BADGE_CLASS.red).toContain("bg-severity-red");
    expect(SEVERITY_BADGE_CLASS.evacuate).toContain("bg-severity-evacuate");
  });

  it("mirrors the CSS token hex values for every severity", () => {
    expect(SEVERITY_HEX).toEqual({
      yellow: "#eab308",
      orange: "#f97316",
      red: "#dc2626",
      evacuate: "#7f1d1d",
    });
  });

  it("pairs each severity with the text color used on top of it", () => {
    expect(SEVERITY_TEXT_HEX.yellow).toBe("#000000");
    expect(SEVERITY_TEXT_HEX.orange).toBe("#000000");
    expect(SEVERITY_TEXT_HEX.red).toBe("#ffffff");
    expect(SEVERITY_TEXT_HEX.evacuate).toBe("#ffffff");
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

/** Mirrors the --color-severity-* tokens in globals.css. */
export const SEVERITY_HEX: Record<Severity, string> = {
  yellow: "#eab308",
  orange: "#f97316",
  red: "#dc2626",
  evacuate: "#7f1d1d",
};

/** The text color placed on top of each severity background. */
export const SEVERITY_TEXT_HEX: Record<Severity, string> = {
  yellow: "#000000",
  orange: "#000000",
  red: "#ffffff",
  evacuate: "#ffffff",
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- severity`
Expected: PASS, 5 tests passed.

- [ ] **Step 5: Write the failing tests for depth.ts**

Create `src/lib/depth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  DEPTH_LEVELS,
  DEPTH_LABEL,
  DEPTH_CM,
  DEPTH_SEVERITY,
  depthFillPercent,
} from "./depth";

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
    expect(DEPTH_SEVERITY.dry).toBe("yellow");
    expect(DEPTH_SEVERITY.ankle).toBe("yellow");
    expect(DEPTH_SEVERITY.knee).toBe("orange");
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

    it("submerges a child fully at a depth an adult is only partly in", () => {
      expect(depthFillPercent(150, 110)).toBe(100);
      expect(depthFillPercent(150, 170)).toBeLessThan(100);
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

/** Approximate water depth in centimetres for each reported level. */
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

/** Percentage of a figure of the given height that the water covers. */
export function depthFillPercent(depthCm: number, figureHeightCm: number): number {
  const percent = (depthCm / figureHeightCm) * 100;
  return Math.max(0, Math.min(100, percent));
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npm test -- depth`
Expected: PASS, 9 tests passed.

- [ ] **Step 9: Write the failing tests for contrast.ts**

This is what makes the Task 10 accessibility pass automated instead of a manual eyeball. Create `src/lib/contrast.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { contrastRatio } from "./contrast";
import { SEVERITY_ORDER, SEVERITY_HEX, SEVERITY_TEXT_HEX } from "./severity";

describe("contrastRatio", () => {
  it("gives 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("gives 1 for a color against itself", () => {
    expect(contrastRatio("#dc2626", "#dc2626")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#eab308", "#000000")).toBeCloseTo(
      contrastRatio("#000000", "#eab308"),
      5
    );
  });
});

describe("severity palette accessibility", () => {
  it.each(SEVERITY_ORDER)(
    "%s badge meets WCAG AA (>= 4.5:1) against its text color",
    (severity) => {
      const ratio = contrastRatio(SEVERITY_HEX[severity], SEVERITY_TEXT_HEX[severity]);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  );
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `npm test -- contrast`
Expected: FAIL with "Cannot find module './contrast'"

- [ ] **Step 11: Implement contrast.ts**

Create `src/lib/contrast.ts`:

```typescript
function channelLuminance(value255: number): number {
  const c = value255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** WCAG 2.1 contrast ratio between two hex colors, from 1 to 21. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 12: Run to verify it passes**

Run: `npm test -- contrast`
Expected: PASS, 7 tests passed. (Reference values: yellow ≈ 10.9:1, orange ≈ 7.5:1, red ≈ 4.8:1, evacuate ≈ 10.0:1 — red is the tightest and still clears AA.)

- [ ] **Step 13: Commit**

```bash
git add src/lib/severity.ts src/lib/severity.test.ts src/lib/depth.ts src/lib/depth.test.ts src/lib/contrast.ts src/lib/contrast.test.ts
git commit -m "feat: add severity, depth, and WCAG contrast domain logic"
```

---

### Task 3: Localized types and mock data

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/i18n.ts`
- Create: `src/lib/mock-data.ts`, `src/lib/mock-data.test.ts`

**Interfaces:**
- Consumes: `Severity` from `src/lib/severity.ts`.
- Produces: `LanguageCode`, `LocalizedText`, `Zone`, `AlertRecord` types; `t(text, lang)`; `MOCK_ZONES: Zone[]` (three zones), `MOCK_ALERTS: AlertRecord[]`, `getActiveAlertForZone(zoneId)`. Consumed by Tasks 4, 5, 6, 8, 9, 10.

- [ ] **Step 1: Write the failing test**

Create `src/lib/mock-data.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { MOCK_ZONES, MOCK_ALERTS, getActiveAlertForZone } from "./mock-data";
import { t } from "./i18n";

describe("mock-data", () => {
  it("has at least three zones so selection and listing are meaningful", () => {
    expect(MOCK_ZONES.length).toBeGreaterThanOrEqual(3);
  });

  it("gives every zone the fields the UI reads", () => {
    for (const zone of MOCK_ZONES) {
      expect(zone.id).toBeTruthy();
      expect(zone.name).toBeTruthy();
      expect(zone.evacuationCenterName).toBeTruthy();
      expect(zone.hotlineNumber).toBeTruthy();
      expect(zone.evacuationRouteText.en).toBeTruthy();
      expect(zone.evacuationRouteText.fil).toBeTruthy();
    }
  });

  it("localizes every alert message in both baseline languages", () => {
    for (const alert of MOCK_ALERTS) {
      expect(t(alert.message, "en")).toBeTruthy();
      expect(t(alert.message, "fil")).toBeTruthy();
      expect(t(alert.message, "en")).not.toBe(t(alert.message, "fil"));
    }
  });

  it("returns the active alert for a zone that has one", () => {
    const alert = getActiveAlertForZone("zone-1");
    expect(alert).toBeDefined();
    expect(alert?.zoneId).toBe("zone-1");
    expect(alert?.isActive).toBe(true);
  });

  it("returns undefined for a real zone with no active alert", () => {
    expect(MOCK_ZONES.some((z) => z.id === "zone-3")).toBe(true);
    expect(getActiveAlertForZone("zone-3")).toBeUndefined();
  });

  it("every mock alert references a real mock zone", () => {
    const zoneIds = new Set(MOCK_ZONES.map((z) => z.id));
    for (const alert of MOCK_ALERTS) {
      expect(zoneIds.has(alert.zoneId)).toBe(true);
    }
  });
});

describe("t", () => {
  it("returns the requested language", () => {
    expect(t({ en: "Hello", fil: "Kumusta" }, "fil")).toBe("Kumusta");
  });

  it("falls back to English when a translation is empty", () => {
    expect(t({ en: "Hello", fil: "" }, "fil")).toBe("Hello");
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

/** Baseline languages per PRD Accessibility & Inclusion #1. */
export type LanguageCode = "en" | "fil";

/**
 * User-facing copy, stored per-language to match the PRD's jsonb columns
 * so Phase 2's Supabase seed needs no remodelling.
 */
export type LocalizedText = Record<LanguageCode, string>;

export interface Zone {
  id: string;
  psgcBarangayCode: string;
  name: string;
  evacuationCenterName: string;
  evacuationRouteText: LocalizedText;
  hotlineNumber: string;
}

export interface AlertRecord {
  id: string;
  zoneId: string;
  severity: Severity;
  message: LocalizedText;
  issuedAt: string;
  isActive: boolean;
}
```

- [ ] **Step 4: Write i18n.ts**

Create `src/lib/i18n.ts`:

```typescript
import type { LanguageCode, LocalizedText } from "./types";

export const LANGUAGE_LABEL: Record<LanguageCode, string> = {
  en: "English",
  fil: "Filipino",
};

export const LANGUAGES: LanguageCode[] = ["en", "fil"];

/** Reads localized copy, falling back to English if a translation is missing. */
export function t(text: LocalizedText, lang: LanguageCode): string {
  return text[lang] || text.en;
}
```

- [ ] **Step 5: Write mock-data.ts**

Create `src/lib/mock-data.ts`:

```typescript
import type { Zone, AlertRecord } from "./types";

export const MOCK_ZONES: Zone[] = [
  {
    id: "zone-1",
    psgcBarangayCode: "137404001",
    name: "Barangay San Isidro",
    evacuationCenterName: "San Isidro Elementary School",
    evacuationRouteText: {
      en: "Head to Rizal St., then straight ahead to the school gym on your right.",
      fil: "Dumaan sa Rizal St., pagkatapos ay diretso sa gym ng paaralan sa iyong kanan.",
    },
    hotlineNumber: "09171234567",
  },
  {
    id: "zone-2",
    psgcBarangayCode: "137404002",
    name: "Barangay Malinis",
    evacuationCenterName: "Malinis Covered Court",
    evacuationRouteText: {
      en: "Take Mabini St. north to the covered court beside the health center.",
      fil: "Dumaan sa Mabini St. pahilaga papunta sa covered court katabi ng health center.",
    },
    hotlineNumber: "09171234568",
  },
  {
    id: "zone-3",
    psgcBarangayCode: "137404003",
    name: "Barangay Bagong Silang",
    evacuationCenterName: "Bagong Silang High School",
    evacuationRouteText: {
      en: "Follow Bonifacio Ave. east, then turn left at the chapel to reach the high school.",
      fil: "Sundan ang Bonifacio Ave. pasilangan, kumaliwa sa kapilya papunta sa high school.",
    },
    hotlineNumber: "09171234569",
  },
];

export const MOCK_ALERTS: AlertRecord[] = [
  {
    id: "alert-1",
    zoneId: "zone-1",
    severity: "orange",
    message: {
      en: "Water levels rising near Barangay San Isidro. Monitor conditions and prepare to evacuate.",
      fil: "Tumataas ang tubig malapit sa Barangay San Isidro. Bantayan ang sitwasyon at maghanda nang lumikas.",
    },
    issuedAt: "2026-09-01T08:00:00.000Z",
    isActive: true,
  },
  {
    id: "alert-2",
    zoneId: "zone-2",
    severity: "red",
    message: {
      en: "Waist-deep flooding reported in Barangay Malinis. Move to the evacuation center now.",
      fil: "May baha na hanggang baywang sa Barangay Malinis. Pumunta na sa evacuation center ngayon.",
    },
    issuedAt: "2026-09-01T08:30:00.000Z",
    isActive: true,
  },
];

export function getActiveAlertForZone(zoneId: string): AlertRecord | undefined {
  return MOCK_ALERTS.find((alert) => alert.zoneId === zoneId && alert.isActive);
}
```

Note `issuedAt` is a fixed literal, not `new Date()`, so server and client render identically and no hydration mismatch is possible.

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- mock-data`
Expected: PASS, 8 tests passed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/i18n.ts src/lib/mock-data.ts src/lib/mock-data.test.ts
git commit -m "feat: add localized zone/alert types and three-zone mock data"
```

---

### Task 4: Language provider, root layout, and emergency hotline button

**Files:**
- Create: `src/features/i18n/language-provider.tsx`, `src/features/i18n/language-provider.test.tsx`
- Create: `src/features/i18n/language-toggle.tsx`
- Create: `src/components/emergency-hotline-button.tsx`, `src/components/emergency-hotline-button.test.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `LanguageCode` from `src/lib/types.ts`, `LANGUAGES`/`LANGUAGE_LABEL` from `src/lib/i18n.ts`, `MOCK_ZONES` from `src/lib/mock-data.ts`.
- Produces: `<LanguageProvider>`, `useLanguage(): { lang: LanguageCode; setLang: (l: LanguageCode) => void }` — **defaults to `"en"` with a no-op setter when rendered with no provider, so downstream component tests need no wrapper**; `<LanguageToggle />`; `<EmergencyHotlineButton hotlineNumber={string} />`. Consumed by Tasks 6, 8, 9.

- [ ] **Step 1: Write the failing test for the language provider**

Create `src/features/i18n/language-provider.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider, useLanguage } from "./language-provider";

function Probe() {
  const { lang, setLang } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang("fil")}>switch</button>
    </div>
  );
}

describe("LanguageProvider", () => {
  it("defaults to English when no provider wraps the tree", () => {
    render(<Probe />);
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
  });

  it("provides and updates the active language", async () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    );
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByTestId("lang")).toHaveTextContent("fil");
  });

  it("accepts a starting language so tests can render a non-default one", () => {
    render(
      <LanguageProvider initialLang="fil">
        <Probe />
      </LanguageProvider>
    );
    expect(screen.getByTestId("lang")).toHaveTextContent("fil");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- language-provider`
Expected: FAIL with "Cannot find module './language-provider'"

- [ ] **Step 3: Implement the language provider**

Create `src/features/i18n/language-provider.tsx`:

```typescript
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { LanguageCode } from "@/lib/types";

interface LanguageContextValue {
  lang: LanguageCode;
  setLang: (lang: LanguageCode) => void;
}

/** Defaults to English so components render standalone (and in tests) without a provider. */
const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
});

export function LanguageProvider({
  children,
  initialLang = "en",
}: {
  children: ReactNode;
  initialLang?: LanguageCode;
}) {
  const [lang, setLang] = useState<LanguageCode>(initialLang);
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- language-provider`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Implement the language toggle**

Create `src/features/i18n/language-toggle.tsx`:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { LANGUAGES, LANGUAGE_LABEL } from "@/lib/i18n";
import { useLanguage } from "./language-provider";

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="flex gap-2" role="group" aria-label="Language">
      {LANGUAGES.map((code) => (
        <Button
          key={code}
          type="button"
          size="sm"
          variant={code === lang ? "default" : "outline"}
          aria-pressed={code === lang}
          onClick={() => setLang(code)}
        >
          {LANGUAGE_LABEL[code]}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Write the failing test for the hotline button**

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

  it("meets the 44px minimum touch target", () => {
    render(<EmergencyHotlineButton hotlineNumber="09171234567" />);
    const link = screen.getByRole("link", { name: /emergency hotline/i });
    // h-14/w-14 in Tailwind is 3.5rem = 56px, comfortably over the 44px minimum.
    expect(link.className).toMatch(/h-14/);
    expect(link.className).toMatch(/w-14/);
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npm test -- emergency-hotline-button`
Expected: FAIL with "Cannot find module './emergency-hotline-button'"

- [ ] **Step 8: Implement the hotline button**

Create `src/components/emergency-hotline-button.tsx`:

```typescript
import { Phone } from "lucide-react";

export function EmergencyHotlineButton({ hotlineNumber }: { hotlineNumber: string }) {
  return (
    <a
      href={`tel:${hotlineNumber}`}
      aria-label="Call emergency hotline"
      className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-severity-red text-white shadow-lg"
    >
      <Phone className="h-6 w-6" aria-hidden="true" />
    </a>
  );
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `npm test -- emergency-hotline-button`
Expected: PASS, 2 tests passed.

- [ ] **Step 10: Wire the layout**

Modify `src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { LanguageToggle } from "@/features/i18n/language-toggle";
import { EmergencyHotlineButton } from "@/components/emergency-hotline-button";
import { MOCK_ZONES } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "WeatherWell",
  description: "Offline-capable flood alerts and evacuation guidance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <LanguageProvider>
          <header className="flex justify-end p-3">
            <LanguageToggle />
          </header>
          {children}
          <EmergencyHotlineButton hotlineNumber={MOCK_ZONES[0].hotlineNumber} />
        </LanguageProvider>
      </body>
    </html>
  );
}
```

No `next/font/google` import — the system font stack comes from the `--font-sans` token set in Task 1 and is applied via `font-sans`. No `dark` class is needed either: Task 1 put the dark palette on bare `:root`.

- [ ] **Step 11: Commit**

```bash
git add src/features/i18n src/components/emergency-hotline-button.tsx src/components/emergency-hotline-button.test.tsx src/app/layout.tsx
git commit -m "feat: add language provider, toggle, dark layout, and hotline button"
```

---

### Task 5: Consent notice and zone onboarding

**Files:**
- Create: `src/features/onboarding/consent-notice.tsx`, `src/features/onboarding/consent-notice.test.tsx`
- Create: `src/features/onboarding/zone-picker.tsx`, `src/features/onboarding/zone-picker.test.tsx`
- Create: `src/features/onboarding/onboarding-storage.ts`
- Create: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `MOCK_ZONES` from `src/lib/mock-data.ts`, `Zone` from `src/lib/types.ts`, shadcn `Button`/`Card`/`Label`/`RadioGroup` from Task 1.
- Produces: `<ConsentNotice onAccept={() => void} />`; `<ZonePicker zones={Zone[]} onSelect={(zoneId: string) => void} />`; `ONBOARDED_KEY`, `markOnboarded()`, `hasOnboarded(): boolean` from `onboarding-storage.ts`. `hasOnboarded` is consumed by Task 6's onboarding gate.

- [ ] **Step 1: Write the failing test for ConsentNotice**

Create `src/features/onboarding/consent-notice.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentNotice } from "./consent-notice";

describe("ConsentNotice", () => {
  it("names both kinds of personal data it collects", () => {
    render(<ConsentNotice onAccept={() => {}} />);
    expect(screen.getByText(/location/i)).toBeInTheDocument();
    expect(screen.getByText(/phone number/i)).toBeInTheDocument();
  });

  it("cites the Data Privacy Act so the legal basis is visible", () => {
    render(<ConsentNotice onAccept={() => {}} />);
    expect(screen.getByText(/RA 10173/i)).toBeInTheDocument();
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
Expected: FAIL with "Cannot find module './consent-notice'". (All packages and shadcn components this test needs were installed in Task 1, so this is the only missing module.)

- [ ] **Step 3: Implement ConsentNotice**

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
          barangay zone and to confirm water-level reports come from where you say they
          do. Your location is not stored beyond validating a report.
        </p>
        <p>
          WeatherWell also asks for your <strong>phone number</strong> so it can send SMS
          alerts if your internet connection drops. It is stored securely and never
          shared.
        </p>
        <p>You can decline either and still see public alerts for your area.</p>
        <p className="text-muted-foreground">
          Collected under the Data Privacy Act of 2012 (RA 10173) with your consent.
        </p>
        <Button onClick={onAccept} className="w-full" size="lg">
          I understand
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- consent-notice`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Write the failing test for ZonePicker**

Create `src/features/onboarding/zone-picker.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZonePicker } from "./zone-picker";
import { MOCK_ZONES } from "@/lib/mock-data";

function stubGeolocation(value: unknown) {
  Object.defineProperty(global.navigator, "geolocation", {
    value,
    configurable: true,
  });
}

describe("ZonePicker", () => {
  beforeEach(() => {
    stubGeolocation(undefined);
  });

  it("lists every zone by name", () => {
    render(<ZonePicker zones={MOCK_ZONES} onSelect={() => {}} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("disables confirm until a zone is chosen", () => {
    render(<ZonePicker zones={MOCK_ZONES} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("calls onSelect with a non-default zone the user picked", async () => {
    const onSelect = vi.fn();
    render(<ZonePicker zones={MOCK_ZONES} onSelect={onSelect} />);

    // Deliberately the second zone: proves the choice is read, not defaulted.
    await userEvent.click(screen.getByText(MOCK_ZONES[1].name));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onSelect).toHaveBeenCalledWith(MOCK_ZONES[1].id);
  });

  it("auto-detects a zone via geolocation when permission is granted", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 14.6, longitude: 121.0 } } as GeolocationPosition);
    });
    stubGeolocation({ getCurrentPosition });

    render(<ZonePicker zones={MOCK_ZONES} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(getCurrentPosition).toHaveBeenCalled();
    expect(await screen.findByText(/detected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
  });

  it("falls back to the manual list when geolocation is denied", async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({ code: 1, message: "denied" } as GeolocationPositionError);
      }
    );
    stubGeolocation({ getCurrentPosition });

    render(<ZonePicker zones={MOCK_ZONES} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(await screen.findByText(/couldn.t detect/i)).toBeInTheDocument();
    expect(screen.getByText(MOCK_ZONES[0].name)).toBeInTheDocument();
  });

  it("reports failure when the device has no geolocation API at all", async () => {
    render(<ZonePicker zones={MOCK_ZONES} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    expect(await screen.findByText(/couldn.t detect/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- zone-picker`
Expected: FAIL with "Cannot find module './zone-picker'"

- [ ] **Step 7: Implement ZonePicker**

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
  // Starts empty so the user must make a real choice.
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [detection, setDetection] = useState<DetectionState>("idle");

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setDetection("failed");
      return;
    }

    setDetection("detecting");
    navigator.geolocation.getCurrentPosition(
      () => {
        // Phase 1 ships no real boundary polygons — matching a fix to a
        // barangay lands with the GeoRisk/PSGC data in Phase 2. Until then a
        // successful fix proposes the first zone and the user can correct it.
        setSelected(zones[0]?.id);
        setDetection("detected");
      },
      () => setDetection("failed")
    );
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <p className="text-sm text-muted-foreground">
        Choose your barangay so alerts and evacuation instructions match your area.
      </p>

      <Button type="button" variant="outline" size="lg" onClick={handleUseMyLocation}>
        Use my location
      </Button>

      {detection === "detected" && (
        <p className="text-sm">
          Detected: {zones.find((z) => z.id === selected)?.name} — change it below if
          that is wrong.
        </p>
      )}
      {detection === "failed" && (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t detect your zone automatically — pick it below.
        </p>
      )}

      <RadioGroup value={selected} onValueChange={setSelected}>
        {zones.map((zone) => (
          <div key={zone.id} className="flex items-center space-x-3 py-2">
            <RadioGroupItem value={zone.id} id={zone.id} />
            <Label htmlFor={zone.id} className="text-base">
              {zone.name}
            </Label>
          </div>
        ))}
      </RadioGroup>

      <Button
        className="w-full"
        size="lg"
        disabled={!selected}
        onClick={() => selected && onSelect(selected)}
      >
        Confirm zone
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npm test -- zone-picker`
Expected: PASS, 6 tests passed.

- [ ] **Step 9: Add onboarding storage**

Create `src/features/onboarding/onboarding-storage.ts`:

```typescript
export const ONBOARDED_KEY = "weatherwell.onboarded";

/** Browser-only; safe to call from effects. Returns false during SSR. */
export function hasOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === "true";
  } catch {
    return false;
  }
}

export function markOnboarded(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDED_KEY, "true");
  } catch {
    // Private-mode or blocked storage: the user simply sees onboarding again.
  }
}
```

- [ ] **Step 10: Wire the onboarding page**

Create `src/app/onboarding/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConsentNotice } from "@/features/onboarding/consent-notice";
import { ZonePicker } from "@/features/onboarding/zone-picker";
import { markOnboarded } from "@/features/onboarding/onboarding-storage";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function OnboardingPage() {
  const [consented, setConsented] = useState(false);
  const router = useRouter();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      {!consented ? (
        <ConsentNotice onAccept={() => setConsented(true)} />
      ) : (
        <ZonePicker
          zones={MOCK_ZONES}
          onSelect={() => {
            markOnboarded();
            router.replace("/");
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add src/features/onboarding src/app/onboarding
git commit -m "feat: add consent notice and zone onboarding with geolocation detect"
```

---

### Task 6: Alert screen and first-run onboarding gate

Without the gate, a visitor landing on `/` never sees the consent notice or onboarding built in Task 5 — which is exactly what the PRD requires them to see first.

**Files:**
- Create: `src/features/onboarding/onboarding-gate.tsx`, `src/features/onboarding/onboarding-gate.test.tsx`
- Create: `src/features/alerts/severity-badge.tsx`, `src/features/alerts/severity-badge.test.tsx`
- Create: `src/features/alerts/alert-card.tsx`, `src/features/alerts/alert-card.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `Severity`/`SEVERITY_LABEL`/`SEVERITY_BADGE_CLASS` from `src/lib/severity.ts`; `AlertRecord`/`Zone` from `src/lib/types.ts`; `t` from `src/lib/i18n.ts`; `useLanguage` from Task 4; `hasOnboarded` from Task 5; `MOCK_ZONES`/`getActiveAlertForZone` from `src/lib/mock-data.ts`.
- Produces: `<OnboardingGate />`, `<SeverityBadge severity={Severity} />`, `<AlertCard alert={AlertRecord | undefined} zone={Zone} />`. Consumed by `src/app/page.tsx`.

- [ ] **Step 1: Write the failing test for the onboarding gate**

Create `src/features/onboarding/onboarding-gate.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { OnboardingGate } from "./onboarding-gate";
import { ONBOARDED_KEY } from "./onboarding-storage";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

describe("OnboardingGate", () => {
  beforeEach(() => {
    replace.mockClear();
    window.localStorage.clear();
  });

  it("redirects a first-time visitor to onboarding", () => {
    render(<OnboardingGate />);
    expect(replace).toHaveBeenCalledWith("/onboarding");
  });

  it("leaves an already-onboarded visitor alone", () => {
    window.localStorage.setItem(ONBOARDED_KEY, "true");
    render(<OnboardingGate />);
    expect(replace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- onboarding-gate`
Expected: FAIL with "Cannot find module './onboarding-gate'"

- [ ] **Step 3: Implement the onboarding gate**

Create `src/features/onboarding/onboarding-gate.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasOnboarded } from "./onboarding-storage";

/** Renders nothing; sends first-time visitors to consent + zone onboarding. */
export function OnboardingGate() {
  const router = useRouter();

  useEffect(() => {
    if (!hasOnboarded()) {
      router.replace("/onboarding");
    }
  }, [router]);

  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- onboarding-gate`
Expected: PASS, 2 tests passed.

- [ ] **Step 5: Write the failing test for SeverityBadge**

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

  it("applies the matching severity color class", () => {
    render(<SeverityBadge severity="red" />);
    expect(screen.getByText("Warning")).toHaveClass("bg-severity-red");
  });

  it("uses the evacuate styling for the top severity", () => {
    render(<SeverityBadge severity="evacuate" />);
    expect(screen.getByText("Evacuate Now")).toHaveClass("bg-severity-evacuate");
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- severity-badge`
Expected: FAIL with "Cannot find module './severity-badge'"

- [ ] **Step 7: Implement SeverityBadge**

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

- [ ] **Step 8: Write the failing test for AlertCard**

Create `src/features/alerts/alert-card.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertCard } from "./alert-card";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { MOCK_ZONES, MOCK_ALERTS } from "@/lib/mock-data";

const zone = MOCK_ZONES[0];
const alert = MOCK_ALERTS[0];

describe("AlertCard", () => {
  it("shows the zone name, severity, and English message by default", () => {
    render(<AlertCard alert={alert} zone={zone} />);
    expect(screen.getByText(zone.name)).toBeInTheDocument();
    expect(screen.getByText("Watch")).toBeInTheDocument();
    expect(screen.getByText(alert.message.en)).toBeInTheDocument();
  });

  it("shows the Filipino message when that language is active", () => {
    render(
      <LanguageProvider initialLang="fil">
        <AlertCard alert={alert} zone={zone} />
      </LanguageProvider>
    );
    expect(screen.getByText(alert.message.fil)).toBeInTheDocument();
    expect(screen.queryByText(alert.message.en)).not.toBeInTheDocument();
  });

  it("tags localized copy with its language for screen readers", () => {
    render(
      <LanguageProvider initialLang="fil">
        <AlertCard alert={alert} zone={zone} />
      </LanguageProvider>
    );
    expect(screen.getByText(alert.message.fil)).toHaveAttribute("lang", "fil");
  });

  it("shows a 'no active alert' state when there is no alert", () => {
    render(<AlertCard alert={undefined} zone={MOCK_ZONES[2]} />);
    expect(screen.getByText(/no active alert/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run to verify it fails**

Run: `npm test -- alert-card`
Expected: FAIL with "Cannot find module './alert-card'"

- [ ] **Step 10: Implement AlertCard**

Create `src/features/alerts/alert-card.tsx`:

```typescript
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "./severity-badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { AlertRecord, Zone } from "@/lib/types";

export function AlertCard({
  alert,
  zone,
}: {
  alert: AlertRecord | undefined;
  zone: Zone;
}) {
  const { lang } = useLanguage();

  return (
    <Card className="w-full max-w-md border-2">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{zone.name}</CardTitle>
        {alert && <SeverityBadge severity={alert.severity} />}
      </CardHeader>
      <CardContent>
        {alert ? (
          <p lang={lang} className="text-base">
            {t(alert.message, lang)}
          </p>
        ) : (
          <p className="text-muted-foreground">No active alert for this zone.</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 11: Run to verify it passes**

Run: `npm test -- alert-card`
Expected: PASS, 4 tests passed. Also run `npm test -- severity-badge` — PASS, 3 tests.

- [ ] **Step 12: Wire the home page**

Modify `src/app/page.tsx`:

```typescript
import Link from "next/link";
import { AlertCard } from "@/features/alerts/alert-card";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { Button } from "@/components/ui/button";
import { MOCK_ZONES, getActiveAlertForZone } from "@/lib/mock-data";

export default function Home() {
  const zone = MOCK_ZONES[0];
  const alert = getActiveAlertForZone(zone.id);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-6">
      <OnboardingGate />
      <AlertCard alert={alert} zone={zone} />

      {/* Progressive disclosure: evacuation is the one primary action;
          the rest are visibly secondary. */}
      <div className="flex w-full max-w-md flex-col gap-3">
        <Button asChild size="lg">
          <Link href="/evacuation">View evacuation instructions</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/report">Report water level</Link>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/map">View zone map</Link>
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 13: Commit**

```bash
git add src/features/alerts src/features/onboarding/onboarding-gate.tsx src/features/onboarding/onboarding-gate.test.tsx src/app/page.tsx
git commit -m "feat: add alert screen and first-run onboarding gate"
```

---

### Task 7: Depth-reference visual (shared waterline)

Both figures stand on one ground line and one water surface crosses both, drawn at **1px per centimetre**. The child is drawn physically shorter, so a depth that reaches an adult's chest closes over a child's head — which is the whole point of showing two figures.

**Files:**
- Create: `src/features/water-level-report/depth-reference-visual.tsx`
- Create: `src/features/water-level-report/depth-reference-visual.test.tsx`

**Interfaces:**
- Consumes: `DepthLevel`, `DEPTH_CM`, `DEPTH_LABEL`, `DEPTH_SEVERITY`, `depthFillPercent` from `src/lib/depth.ts`; `SEVERITY_HEX` from `src/lib/severity.ts`.
- Produces: `<DepthReferenceVisual depthLevel={DepthLevel} />`, plus exported constants `ADULT_HEIGHT_CM = 170` and `CHILD_HEIGHT_CM = 110`. Consumed by Task 8's report form.

- [ ] **Step 1: Write the failing test**

Create `src/features/water-level-report/depth-reference-visual.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DepthReferenceVisual,
  ADULT_HEIGHT_CM,
  CHILD_HEIGHT_CM,
} from "./depth-reference-visual";

function fillHeight(container: HTMLElement, who: "adult" | "child"): number {
  const rect = container.querySelector(`[data-testid="${who}-fill"]`);
  return Number(rect?.getAttribute("height"));
}

describe("DepthReferenceVisual", () => {
  it("renders both an adult and a child reference figure", () => {
    render(<DepthReferenceVisual depthLevel="knee" />);
    expect(screen.getByLabelText(/adult reference figure/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/child reference figure/i)).toBeInTheDocument();
  });

  it("draws the child shorter than the adult", () => {
    const { container } = render(<DepthReferenceVisual depthLevel="dry" />);
    const adult = container.querySelector('[data-testid="adult-body"]');
    const child = container.querySelector('[data-testid="child-body"]');
    expect(Number(child?.getAttribute("data-height-cm"))).toBeLessThan(
      Number(adult?.getAttribute("data-height-cm"))
    );
  });

  it("puts both figures under the same absolute waterline", () => {
    // At ankle depth the water is 15cm off the ground for everyone.
    const { container } = render(<DepthReferenceVisual depthLevel="ankle" />);
    expect(fillHeight(container, "adult")).toBe(15);
    expect(fillHeight(container, "child")).toBe(15);
  });

  it("submerges the child completely at a depth the adult is only partly in", () => {
    const { container } = render(<DepthReferenceVisual depthLevel="neck" />);
    expect(fillHeight(container, "child")).toBe(CHILD_HEIGHT_CM);
    expect(fillHeight(container, "adult")).toBeLessThan(ADULT_HEIGHT_CM);
  });

  it("raises the water as the depth level increases", () => {
    const { container, rerender } = render(<DepthReferenceVisual depthLevel="ankle" />);
    const shallow = fillHeight(container, "adult");
    rerender(<DepthReferenceVisual depthLevel="waist" />);
    expect(fillHeight(container, "adult")).toBeGreaterThan(shallow);
  });

  it("draws a single shared waterline", () => {
    const { container } = render(<DepthReferenceVisual depthLevel="knee" />);
    expect(container.querySelectorAll('[data-testid="waterline"]')).toHaveLength(1);
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
"use client";

import { useId } from "react";
import {
  DEPTH_CM,
  DEPTH_LABEL,
  DEPTH_SEVERITY,
  depthFillPercent,
  type DepthLevel,
} from "@/lib/depth";
import { SEVERITY_HEX } from "@/lib/severity";

export const ADULT_HEIGHT_CM = 170;
export const CHILD_HEIGHT_CM = 110;

/** The scene is drawn at exactly 1 SVG unit per centimetre. */
const GROUND_Y = 180;
const SCENE_WIDTH = 200;
const SCENE_HEIGHT = 190;
const ADULT_CENTER_X = 62;
const CHILD_CENTER_X = 142;

interface FigureProps {
  who: "adult" | "child";
  label: string;
  heightCm: number;
  centerX: number;
  depthCm: number;
  color: string;
  clipId: string;
}

function Figure({
  who,
  label,
  heightCm,
  centerX,
  depthCm,
  color,
  clipId,
}: FigureProps) {
  const topY = GROUND_Y - heightCm;
  const headRadius = heightCm * 0.09;
  const bodyWidth = heightCm * 0.24;
  const bodyX = centerX - bodyWidth / 2;
  const bodyTopY = topY + headRadius * 2;

  // How much of *this* figure the water covers, in centimetres (= SVG units).
  // Rounded to 2dp: the percent round-trip is lossy in binary floating point
  // (15cm on a 170cm figure comes back as 15.000000000000002).
  const submergedCm =
    Math.round((depthFillPercent(depthCm, heightCm) / 100) * heightCm * 100) / 100;

  return (
    <g role="img" aria-label={label}>
      <defs>
        <clipPath id={clipId}>
          <circle cx={centerX} cy={topY + headRadius} r={headRadius} />
          <rect
            x={bodyX}
            y={bodyTopY}
            width={bodyWidth}
            height={GROUND_Y - bodyTopY}
            rx={bodyWidth / 2}
          />
        </clipPath>
      </defs>

      {/* Silhouette outline */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          data-testid={`${who}-body`}
          data-height-cm={heightCm}
          x={centerX - bodyWidth}
          y={topY}
          width={bodyWidth * 2}
          height={heightCm}
          fill="currentColor"
          opacity={0.28}
        />
        {/* Water covering this figure, measured from the shared ground line */}
        <rect
          data-testid={`${who}-fill`}
          x={centerX - bodyWidth}
          y={GROUND_Y - submergedCm}
          width={bodyWidth * 2}
          height={submergedCm}
          fill={color}
        />
      </g>
    </g>
  );
}

export function DepthReferenceVisual({ depthLevel }: { depthLevel: DepthLevel }) {
  // useId() emits punctuation that is not safe inside a url(#...) fragment
  // reference, so strip everything except word characters and dashes.
  const baseId = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const depthCm = DEPTH_CM[depthLevel];
  const color = SEVERITY_HEX[DEPTH_SEVERITY[depthLevel]];
  const waterY = GROUND_Y - depthCm;

  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
        className="h-48 w-auto text-foreground"
      >
        <Figure
          who="adult"
          label="Adult reference figure"
          heightCm={ADULT_HEIGHT_CM}
          centerX={ADULT_CENTER_X}
          depthCm={depthCm}
          color={color}
          clipId={`${baseId}-adult`}
        />
        <Figure
          who="child"
          label="Child reference figure"
          heightCm={CHILD_HEIGHT_CM}
          centerX={CHILD_CENTER_X}
          depthCm={depthCm}
          color={color}
          clipId={`${baseId}-child`}
        />

        {/* One waterline across the whole scene — the shared reference */}
        {depthCm > 0 && (
          <line
            data-testid="waterline"
            x1={0}
            y1={waterY}
            x2={SCENE_WIDTH}
            y2={waterY}
            stroke={color}
            strokeWidth={3}
          />
        )}
        {depthCm === 0 && (
          <line
            data-testid="waterline"
            x1={0}
            y1={GROUND_Y}
            x2={SCENE_WIDTH}
            y2={GROUND_Y}
            stroke="currentColor"
            strokeWidth={2}
            opacity={0.4}
          />
        )}

        {/* Ground line */}
        <line
          x1={0}
          y1={GROUND_Y}
          x2={SCENE_WIDTH}
          y2={GROUND_Y}
          stroke="currentColor"
          strokeWidth={2}
        />
      </svg>
      <figcaption className="text-base font-medium">{DEPTH_LABEL[depthLevel]}</figcaption>
    </figure>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- depth-reference-visual`
Expected: PASS, 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/water-level-report/depth-reference-visual.tsx src/features/water-level-report/depth-reference-visual.test.tsx
git commit -m "feat: add depth-reference visual with shared waterline"
```

---

### Task 8: Water-level report form

**Files:**
- Create: `src/features/water-level-report/report-form.tsx`, `src/features/water-level-report/report-form.test.tsx`
- Create: `src/app/report/page.tsx`

**Interfaces:**
- Consumes: `DepthReferenceVisual` from Task 7; `DEPTH_LEVELS`/`DEPTH_LABEL`/`DepthLevel` from `src/lib/depth.ts`; `MOCK_ZONES` from `src/lib/mock-data.ts`.
- Produces: `<ReportForm zoneId={string} onSubmit={(depthLevel: DepthLevel) => void} />`. Consumed by `src/app/report/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/features/water-level-report/report-form.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportForm } from "./report-form";

describe("ReportForm", () => {
  it("offers every depth level as a choice", () => {
    render(<ReportForm zoneId="zone-1" onSubmit={() => {}} />);
    for (const label of ["Dry", "Ankle-deep", "Knee-deep", "Waist-deep", "Neck-deep"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("submits the depth level the user picked", async () => {
    const onSubmit = vi.fn();
    render(<ReportForm zoneId="zone-1" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByLabelText("Waist-deep"));
    await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

    expect(onSubmit).toHaveBeenCalledWith("waist");
  });

  it("updates the depth visual when the selection changes", async () => {
    const { container } = render(<ReportForm zoneId="zone-1" onSubmit={() => {}} />);

    const before = Number(
      container.querySelector('[data-testid="adult-fill"]')?.getAttribute("height")
    );
    await userEvent.click(screen.getByLabelText("Neck-deep"));
    const after = Number(
      container.querySelector('[data-testid="adult-fill"]')?.getAttribute("height")
    );

    expect(after).toBeGreaterThan(before);
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
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(depthLevel);
      }}
    >
      <input type="hidden" name="zoneId" value={zoneId} />

      <DepthReferenceVisual depthLevel={depthLevel} />

      <RadioGroup
        value={depthLevel}
        onValueChange={(value) => setDepthLevel(value as DepthLevel)}
        aria-label="How deep is the water?"
      >
        {DEPTH_LEVELS.map((level) => (
          <div key={level} className="flex items-center space-x-3 py-2">
            <RadioGroupItem value={level} id={`depth-${level}`} />
            <Label htmlFor={`depth-${level}`} className="text-base">
              {DEPTH_LABEL[level]}
            </Label>
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
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Wire the report page**

Create `src/app/report/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { ReportForm } from "@/features/water-level-report/report-form";
import { DEPTH_LABEL, type DepthLevel } from "@/lib/depth";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function ReportPage() {
  const [submitted, setSubmitted] = useState<DepthLevel | null>(null);
  const zone = MOCK_ZONES[0];

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <h1 className="text-lg font-semibold">Report water level — {zone.name}</h1>
      {submitted ? (
        <p role="status" className="text-base">
          Thanks — your &ldquo;{DEPTH_LABEL[submitted]}&rdquo; report was recorded.
          (Mock only in Phase 1.)
        </p>
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

### Task 9: Evacuation instructions screen with pictogram cues

PRD Accessibility & Inclusion #3 requires icon/pictogram cues alongside the text, so the instructions still carry meaning for residents who read poorly.

**Files:**
- Create: `src/features/evacuation/evacuation-instructions.tsx`
- Create: `src/features/evacuation/evacuation-instructions.test.tsx`
- Create: `src/app/evacuation/page.tsx`

**Interfaces:**
- Consumes: `Zone` from `src/lib/types.ts`; `t` from `src/lib/i18n.ts`; `useLanguage` from Task 4; `MOCK_ZONES` from `src/lib/mock-data.ts`; icons from `lucide-react`.
- Produces: `<EvacuationInstructions zone={Zone} />`. Consumed by `src/app/evacuation/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/features/evacuation/evacuation-instructions.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvacuationInstructions } from "./evacuation-instructions";
import { MOCK_ZONES } from "@/lib/mock-data";

const zone = MOCK_ZONES[0];

describe("EvacuationInstructions", () => {
  it("shows the evacuation center name and route text", () => {
    render(<EvacuationInstructions zone={zone} />);
    expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
    expect(screen.getByText(zone.evacuationRouteText.en)).toBeInTheDocument();
  });

  it("pairs each instruction with a pictogram cue, never text alone", () => {
    const { container } = render(<EvacuationInstructions zone={zone} />);
    expect(
      container.querySelector('[data-testid="icon-evacuation-center"]')
    ).toBeInTheDocument();
    expect(container.querySelector('[data-testid="icon-route"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="icon-hotline"]')).toBeInTheDocument();
  });

  it("marks decorative icons hidden from screen readers", () => {
    const { container } = render(<EvacuationInstructions zone={zone} />);
    const icon = container.querySelector('[data-testid="icon-route"]');
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("offers a direct call link to the zone hotline", () => {
    render(<EvacuationInstructions zone={zone} />);
    expect(screen.getByRole("link", { name: /call/i })).toHaveAttribute(
      "href",
      `tel:${zone.hotlineNumber}`
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- evacuation-instructions`
Expected: FAIL with "Cannot find module './evacuation-instructions'"

- [ ] **Step 3: Implement EvacuationInstructions**

Create `src/features/evacuation/evacuation-instructions.tsx`:

```typescript
"use client";

import { Building2, Navigation, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { Zone } from "@/lib/types";

export function EvacuationInstructions({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();

  return (
    <Card className="w-full max-w-md border-2">
      <CardContent className="space-y-6 pt-6">
        <div className="flex items-start gap-4">
          <Building2
            data-testid="icon-evacuation-center"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <div>
            <p className="text-sm text-muted-foreground">Go here</p>
            <p className="text-lg font-semibold">{zone.evacuationCenterName}</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <Navigation
            data-testid="icon-route"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <div>
            <p className="text-sm text-muted-foreground">How to get there</p>
            <p lang={lang} className="text-base">
              {t(zone.evacuationRouteText, lang)}
            </p>
          </div>
        </div>

        <a
          href={`tel:${zone.hotlineNumber}`}
          className="flex items-center gap-4 rounded-md border-2 border-severity-red p-3"
        >
          <Phone
            data-testid="icon-hotline"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <span className="text-base font-medium">Call {zone.hotlineNumber}</span>
        </a>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- evacuation-instructions`
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Wire the evacuation page**

Create `src/app/evacuation/page.tsx`:

```typescript
import { EvacuationInstructions } from "@/features/evacuation/evacuation-instructions";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function EvacuationPage() {
  const zone = MOCK_ZONES[0];

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <h1 className="text-lg font-semibold">Evacuation — {zone.name}</h1>
      <EvacuationInstructions zone={zone} />
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/evacuation src/app/evacuation
git commit -m "feat: add evacuation instructions with pictogram cues"
```

---

### Task 10: Zone map, automated accessibility audit, and Vercel preview

**Files:**
- Create: `src/features/zones/zone-map.tsx`, `src/features/zones/zone-map.test.tsx`
- Create: `src/app/map/page.tsx`
- Create: `src/features/a11y/accessibility.test.tsx`

**Interfaces:**
- Consumes: `Zone` from `src/lib/types.ts`, `MOCK_ZONES` from `src/lib/mock-data.ts`, `axe-core` from Task 1, plus every component built in Tasks 4–9.
- Produces: `<ZoneMap zones={Zone[]} />`. Final task — nothing downstream depends on it.

- [ ] **Step 1: Write the failing test for ZoneMap**

Create `src/features/zones/zone-map.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZoneMap } from "./zone-map";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("ZoneMap", () => {
  it("renders a labeled region for every zone", () => {
    render(<ZoneMap zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("renders one region per zone, not a single merged block", () => {
    const { container } = render(<ZoneMap zones={MOCK_ZONES} />);
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(
      MOCK_ZONES.length
    );
  });

  it("is honest that real boundary data is not wired yet", () => {
    render(<ZoneMap zones={MOCK_ZONES} />);
    expect(screen.getByText(/phase 2/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- zone-map`
Expected: FAIL with "Cannot find module './zone-map'"

- [ ] **Step 3: Implement ZoneMap**

Real barangay polygons arrive with the GeoRisk/PSGC data in Phase 2; this is the honest hi-fi stand-in. Create `src/features/zones/zone-map.tsx`:

```typescript
import { MapPin } from "lucide-react";
import type { Zone } from "@/lib/types";

export function ZoneMap({ zones }: { zones: Zone[] }) {
  return (
    <div className="grid w-full max-w-md gap-3">
      {zones.map((zone) => (
        <div
          key={zone.id}
          data-testid="zone-region"
          className="flex items-start gap-3 rounded-md border-2 border-foreground/25 p-4"
        >
          <MapPin aria-hidden="true" className="h-6 w-6 shrink-0" />
          <div>
            <p className="font-medium">{zone.name}</p>
            <p className="text-sm text-muted-foreground">{zone.evacuationCenterName}</p>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Placeholder layout — real barangay boundary data lands in Phase 2.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- zone-map`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Wire the map page**

Create `src/app/map/page.tsx`:

```typescript
import { ZoneMap } from "@/features/zones/zone-map";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function MapPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <h1 className="text-lg font-semibold">Zones</h1>
      <ZoneMap zones={MOCK_ZONES} />
    </main>
  );
}
```

- [ ] **Step 6: Write the automated accessibility audit**

This is the "accessibility pass" from the PRD's Phase 1 exit criteria, made repeatable. Note `color-contrast` is disabled here because jsdom does no layout or painting and cannot evaluate it — that requirement is covered instead by `src/lib/contrast.test.ts` from Task 2, which checks the severity palette numerically.

Create `src/features/a11y/accessibility.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import axe from "axe-core";
import { AlertCard } from "@/features/alerts/alert-card";
import { EvacuationInstructions } from "@/features/evacuation/evacuation-instructions";
import { ReportForm } from "@/features/water-level-report/report-form";
import { ZoneMap } from "@/features/zones/zone-map";
import { ConsentNotice } from "@/features/onboarding/consent-notice";
import { ZonePicker } from "@/features/onboarding/zone-picker";
import { EmergencyHotlineButton } from "@/components/emergency-hotline-button";
import { MOCK_ZONES, MOCK_ALERTS } from "@/lib/mock-data";

async function violationsFor(ui: ReactElement): Promise<string[]> {
  const { container } = render(ui);
  const results = await axe.run(container, {
    rules: {
      // jsdom has no layout/paint, so axe cannot compute contrast here.
      // The severity palette is verified numerically in src/lib/contrast.test.ts.
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });
  return results.violations.map((v) => `${v.id}: ${v.help}`);
}

describe("accessibility (WCAG 2.1 AA, automated subset)", () => {
  it("alert card has no violations", async () => {
    expect(
      await violationsFor(<AlertCard alert={MOCK_ALERTS[0]} zone={MOCK_ZONES[0]} />)
    ).toEqual([]);
  });

  it("evacuation instructions have no violations", async () => {
    expect(
      await violationsFor(<EvacuationInstructions zone={MOCK_ZONES[0]} />)
    ).toEqual([]);
  });

  it("report form has no violations", async () => {
    expect(
      await violationsFor(<ReportForm zoneId="zone-1" onSubmit={() => {}} />)
    ).toEqual([]);
  });

  it("zone map has no violations", async () => {
    expect(await violationsFor(<ZoneMap zones={MOCK_ZONES} />)).toEqual([]);
  });

  it("consent notice has no violations", async () => {
    expect(await violationsFor(<ConsentNotice onAccept={() => {}} />)).toEqual([]);
  });

  it("zone picker has no violations", async () => {
    expect(
      await violationsFor(<ZonePicker zones={MOCK_ZONES} onSelect={() => {}} />)
    ).toEqual([]);
  });

  it("emergency hotline button has no violations", async () => {
    expect(
      await violationsFor(<EmergencyHotlineButton hotlineNumber="09171234567" />)
    ).toEqual([]);
  });
});
```

- [ ] **Step 7: Run the accessibility audit and fix what it finds**

Run: `npm test -- accessibility`
Expected: PASS, 7 tests passed.

If a test fails, the message names the exact rule (e.g. a control missing an accessible name). Fix the component, not the test — the only rules legitimately disabled are the two documented above.

- [ ] **Step 8: Run the full suite and the production build**

```bash
npm test
npm run build
```

Expected: all tests pass; build succeeds with no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/features/zones src/app/map src/features/a11y
git commit -m "feat: add zone map and automated accessibility audit"
```

- [ ] **Step 10: Push and verify the Vercel preview by hand**

```bash
git push origin hi-fi
```

Confirm the `hi-fi` deployment reaches `READY`, then check on a real phone-sized viewport:

1. Open the preview root `/` with fresh storage — it must redirect to `/onboarding`.
2. Accept the consent notice, pick a **non-first** barangay, confirm — it must land back on `/`.
3. Reload `/` — it must now stay on `/` (no redirect loop).
4. Visit `/evacuation`, `/report`, `/map`.
5. On `/report`, step through every depth level and confirm the child figure submerges before the adult does.
6. Toggle the language control in the header and confirm the alert message and evacuation route text change.
7. Confirm the red hotline button is present and tappable on every screen.
8. Confirm the app renders dark **without** the OS being set to dark mode.
9. Dim the screen to roughly 20% brightness and confirm the severity badges and depth visual are still readable — the PRD's dim-light check.
