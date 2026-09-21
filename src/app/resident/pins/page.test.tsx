import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fakeSupabaseFrom } from "@/test-utils/mock-supabase-query";

/**
 * community_pins is public-read (`to anon, authenticated using (true)`), so
 * this page happened to still work with the wrong client — see the same
 * note on reports/page.test.tsx. Kept on the authenticated client anyway,
 * for the same "my own rows" reason, and guarded the same way.
 */
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => {
    throw new Error("must read the resident's own pins via the user client, not the anon server client");
  },
}));

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user-1" } } }) },
    ...fakeSupabaseFrom({
      community_pins: {
        data: [{ id: "p1", status_tag: "flooded", caption: "Waist deep", created_at: "2026-09-01T00:00:00Z", removed: false }],
        error: null,
      },
    }),
  }),
}));

import ResidentPinsPage from "./page";

describe("ResidentPinsPage", () => {
  it("lists the resident's own pins via the authenticated client", async () => {
    render(await ResidentPinsPage());

    expect(screen.getByText("flooded")).toBeInTheDocument();
    expect(screen.getByText("Waist deep")).toBeInTheDocument();
  });
});
