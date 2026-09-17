# Homepage Redesign Plan

## Goal
Redesign the WeatherWell homepage to be more visually impactful, mobile-optimized, and OLED battery-efficient while maintaining all existing functionality.

## Design Principles
1. **Status as hero** — zone status is the most prominent element
2. **OLED-optimized** — true black (#000000) backgrounds, minimize lit pixels
3. **Mobile-first** — map doesn't dominate, actions are accessible
4. **Progressive disclosure** — show what matters, reveal on demand
5. **Performance** — lazy loading, minimal DOM, skeleton states
6. **Touch-friendly** — 44px+ targets, clear affordances

## Current Architecture
- `src/app/page.tsx` — main page, renders OnboardingGate + HomepageMap or fallback
- `src/features/homepage-map/homepage-map.tsx` — main component (map, status, conditions, buttons, pin flow)
- `src/features/homepage-map/personal-status-headline.tsx` — zone status display
- `src/features/homepage-map/current-conditions-panel.tsx` — weather conditions
- `src/features/homepage-map/zone-alert-list-fallback.tsx` — offline fallback
- `src/features/homepage-map/map-canvas.tsx` — Leaflet map (dynamically imported)
- `src/app/globals.css` — theme tokens (dark palette)

## Changes

### 1. OLED-Optimized Theme (`globals.css`)
- Change `--background` from `oklch(0.145 0 0)` (dark gray) to `oklch(0.06 0 0)` (near-black)
- Change `--card` to `oklch(0.10 0 0)` (subtle card distinction)
- Keep severity colors unchanged (they're already bright and accessible)
- Update `.dark` class to match

### 2. PersonalStatusHeadline → StatusHero
**File:** `src/features/homepage-map/personal-status-headline.tsx`

Current: Small card with icon + text
New: Full-width hero with:
- Left accent bar using severity color (4px wide)
- Larger icon (h-10 w-10)
- Status as h1 (text-xl font-bold)
- Zone name as subtitle
- Follow-up message below
- Subtle severity-tinted background (very low opacity)

### 3. Quick Actions → ActionGrid
**New component:** `src/features/homepage-map/action-grid.tsx`

Replace the 4 ghost buttons with a 2x2 grid of card-style buttons:
- Each button: icon + label + subtle border
- Touch-friendly (min 44px height)
- Clear visual hierarchy: Report (primary accent), Evacuation, Zones, Admin
- On desktop (lg+): horizontal row

### 4. Map Height Optimization
**File:** `src/features/homepage-map/homepage-map.tsx`

- Mobile: reduce map height from 340px to 280px
- Keep desktop height at 600px
- Map becomes collapsible on mobile (tap to expand/collapse)

### 5. CurrentConditionsPanel Enhancement
**File:** `src/features/homepage-map/current-conditions-panel.tsx`

- Use severity color for the CloudRain icon when conditions are concerning
- Better typography: rainfall/wind as large numbers with units
- More compact layout on mobile

### 6. HomepageMap Layout Restructure
**File:** `src/features/homepage-map/homepage-map.tsx`

**Mobile layout (default):**
```
┌─────────────────────────┐
│  [Status Hero]           │  ← full-width, severity accent
├─────────────────────────┤
│  [Action Grid]           │  ← 2x2 buttons
├─────────────────────────┤
│  [Map]                   │  ← 280px, collapsible
├─────────────────────────┤
│  [Conditions Panel]      │  ← expandable
└─────────────────────────┘
```

**Desktop layout (lg+):**
```
┌────────────────────────────────────────────┐
│  [Map]           │  [Status Hero]          │
│  (left, tall)    │  [Action Grid]          │
│                  │  [Conditions Panel]     │
│                  │  [Route Info]           │
└────────────────────────────────────────────┘
```

### 7. Header Enhancement
**File:** `src/app/layout.tsx`

- Slightly more prominent brand name
- Better spacing

## Files to Modify
1. `src/app/globals.css` — theme tokens
2. `src/features/homepage-map/personal-status-headline.tsx` → rename to status-hero concept
3. `src/features/homepage-map/homepage-map.tsx` — layout restructure
4. `src/features/homepage-map/current-conditions-panel.tsx` — visual polish
5. `src/app/layout.tsx` — header tweaks
6. `src/features/homepage-map/homepage-map.test.tsx` — update tests
7. `src/features/homepage-map/personal-status-headline.test.tsx` — update tests

## New Files
1. `src/features/homepage-map/action-grid.tsx` — quick actions component

## Constraints
- All severity colors and contrast ratios must remain WCAG AA compliant
- All existing functionality (pin flow, route finding, dialogs) must work unchanged
- All existing tests must pass (with necessary updates)
- Performance budget: no new heavy dependencies
- i18n: all new strings must have English and Filipino translations

## Verification
1. `npm test` — all tests pass
2. `npm run typecheck` — no type errors
3. `npm run lint` — no lint errors
4. `npm run build` — builds successfully
5. Visual: test on 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), 1024px+ (desktop)
6. Accessibility: contrast ratios, keyboard navigation, screen reader labels
