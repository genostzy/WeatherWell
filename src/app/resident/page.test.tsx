import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fakeSupabaseFrom } from "@/test-utils/mock-supabase-query";

/**
 * The bug this guards against: the page authenticated with the user client
 * but then queried through the ANON server client, so `profiles` and
 * `evacuation_check_ins` (both `select ... to authenticated`) came back
 * "permission denied", silently swallowed, and the dashboard always showed
 * "No zone selected" and a 0 check-in count. Mocking @/lib/supabase/server
 * to throw makes any regression back to that client fail loudly here,
 * instead of failing silently the way it did in production.
 */
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => {
    throw new Error("must read the resident's own rows via the user client, not the anon server client");
  },
}));

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user-1" } } }) },
    ...fakeSupabaseFrom({
      profiles: { data: { zone_id: "zone-1" }, error: null },
      water_level_reports: { data: null, error: null, count: 3 },
      community_pins: { data: null, error: null, count: 1 },
      evacuation_check_ins: { data: null, error: null, count: 2 },
      zones: { data: { name: "Barangay Poblacion, Mangaldan" }, error: null },
    }),
  }),
}));

import ResidentOverviewPage from "./page";

describe("ResidentOverviewPage", () => {
  it("reads the zone name, report count, check-in count and pin count via the authenticated client", async () => {
    render(await ResidentOverviewPage());

    expect(screen.getByText("Zone: Barangay Poblacion, Mangaldan")).toBeInTheDocument();
    const reportsCard = screen.getByText("Reports").closest('[data-slot="card"]') as HTMLElement;
    const checkInsCard = screen.getByText("Check-ins").closest('[data-slot="card"]') as HTMLElement;
    const pinsCard = screen.getByText("Pins").closest('[data-slot="card"]') as HTMLElement;
    expect(reportsCard).toHaveTextContent("3");
    expect(checkInsCard).toHaveTextContent("2");
    expect(pinsCard).toHaveTextContent("1");
  });
});
