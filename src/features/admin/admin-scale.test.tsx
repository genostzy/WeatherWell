import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));
vi.mock("@/lib/use-weather-data", () => ({
  useWeatherData: () => ({ current: null, rainfallHistory: [], rainfallForecast: [], isLoading: false, error: null }),
}));

import { AdminOverview } from "./admin-overview";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import type { Official } from "@/lib/auth/official";
import type { Zone } from "@/lib/types";

/**
 * Idea 14: /admin froze the browser at production's ~42k barangays twice,
 * and every mocked test passed both times because the fixtures hold 4 zones.
 * This renders the nationwide admin's home against 42,000 synthetic zones
 * and fails if it takes more than a few seconds (a frozen tab took minutes).
 */
const NATIONWIDE = 42_000;
const BUDGET_MS = 5_000;

const template = FIXTURE_REFERENCE_DATA.zones[0];
const zones: Zone[] = Array.from({ length: NATIONWIDE }, (_, i) => ({
  ...template,
  id: `zone-scale-${i}`,
  psgcBarangayCode: String(1_000_000_000 + i),
  name: `Barangay ${i}`,
  lat: 5 + (i % 200) / 10,
  lng: 117 + Math.floor(i / 200) / 20,
}));

const ADMIN: Official = { userId: "admin-1", displayName: "Admin", areaCode: "", areaName: "All areas", level: "admin" };

describe("admin home at nationwide scale (idea 14)", () => {
  it(`renders for an admin over ${NATIONWIDE.toLocaleString()} barangays within ${BUDGET_MS} ms`, () => {
    const started = performance.now();
    renderWithData(<AdminOverview />, { data: { zones, hazards: {} }, official: ADMIN, alerts: [] });
    const elapsed = performance.now() - started;

    expect(screen.getByText(/needs your attention/i)).toBeInTheDocument();
    expect(screen.getByText(`of ${NATIONWIDE}`)).toBeInTheDocument();
    // The per-barangay picker would be a 42k-option select; it must be skipped.
    expect(screen.queryByLabelText(/barangay/i)).not.toBeInTheDocument();
    expect(elapsed).toBeLessThan(BUDGET_MS);
  }, 30_000);
});
