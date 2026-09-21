import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fakeSupabaseFrom } from "@/test-utils/mock-supabase-query";

/**
 * water_level_reports is public-read (`to anon, authenticated using (true)`),
 * so this page happened to still work with the wrong client — but reading a
 * resident's own rows through the anon client is the wrong pattern
 * regardless, and the sibling pages that share it (check-ins, profile) were
 * genuinely broken by it. This mock keeps the page honest about which client
 * it uses even where RLS wouldn't currently catch a regression.
 */
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => {
    throw new Error("must read the resident's own reports via the user client, not the anon server client");
  },
}));

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user-1" } } }) },
    ...fakeSupabaseFrom({
      water_level_reports: {
        data: [{ id: "r1", zone_id: "zone-1", depth_level: "knee", reported_at: "2026-09-01T00:00:00Z" }],
        error: null,
      },
    }),
  }),
}));

import ResidentReportsPage from "./page";

describe("ResidentReportsPage", () => {
  it("lists the resident's own reports via the authenticated client", async () => {
    render(await ResidentReportsPage());

    expect(screen.getByText("Knee")).toBeInTheDocument();
    expect(screen.getByText("zone-1")).toBeInTheDocument();
  });
});
