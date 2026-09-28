import { describe, it, expect, vi } from "vitest";

const select = vi.fn();
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getClaims: async () => ({ data: null }) },
    from: (table: string) => ({
      select: (columns: string) => {
        select(table, columns);
        const rows =
          table === "community_pins"
            ? [
                {
                  id: "p1",
                  zone_id: "zone-1",
                  status_tag: "road_blocked",
                  caption: "Tree",
                  lat: 1,
                  lng: 2,
                  author_id: "u1",
                  created_at: "2026-09-28T00:00:00Z",
                  removed: false,
                  removed_reason: null,
                  photo_path: "u1/x.jpg",
                },
              ]
            : [];
        const result = { data: rows, error: null };
        return { order: () => ({ limit: async () => result }), limit: async () => result };
      },
    }),
  }),
}));

import { GET } from "./route";

describe("GET /api/pins", () => {
  it("carries a pin's photo path, which only an official's session can turn into a photo", async () => {
    const body = await (await GET()).json();
    expect(select).toHaveBeenCalledWith("community_pins", expect.stringContaining("photo_path"));
    expect(body[0].photoPath).toBe("u1/x.jpg");
  });
});
