import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fakeSupabaseFrom } from "@/test-utils/mock-supabase-query";

/**
 * evacuation_check_ins is `select ... to authenticated` only (no anon read),
 * so reading it through the anon server client returned "permission denied,"
 * silently swallowed, and this page always showed "No check-ins yet." even
 * for a resident with real ones. Mocking @/lib/supabase/server to throw
 * makes a regression back to that client fail loudly here.
 */
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => {
    throw new Error("must read the resident's own check-ins via the user client, not the anon server client");
  },
}));

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user-1" } } }) },
    ...fakeSupabaseFrom({
      evacuation_check_ins: {
        data: [{ id: "c1", zone_id: "zone-1", status: "safe", checked_in_at: "2026-09-01T00:00:00Z" }],
        error: null,
      },
    }),
  }),
}));

import ResidentCheckInsPage from "./page";

describe("ResidentCheckInsPage", () => {
  it("lists the resident's own check-ins via the authenticated client", async () => {
    render(await ResidentCheckInsPage());

    expect(screen.getByText("Safe")).toBeInTheDocument();
    expect(screen.getByText("zone-1")).toBeInTheDocument();
  });
});
