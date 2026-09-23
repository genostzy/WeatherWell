import { describe, it, expect, vi } from "vitest";

const selectedColumns = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({
      select: (columns: string) => {
        selectedColumns(columns);
        return {
          order: () => ({
            limit: async () => ({
              data: [
                {
                  id: "r1",
                  zone_id: "zone-1",
                  depth_level: "knee",
                  reported_at: "2026-09-01T00:00:00Z",
                  trust_weight: 1,
                  is_outlier: false,
                },
              ],
              error: null,
            }),
          }),
        };
      },
    }),
  }),
}));

import { GET } from "./route";

describe("GET /api/reports", () => {
  it("never asks for, or returns, who filed a report or where they stood", async () => {
    const body = await (await GET()).json();

    expect(selectedColumns.mock.calls[0][0]).not.toMatch(/reporter_id|\blat\b|\blng\b/);
    expect(body[0]).not.toHaveProperty("reporterId");
    expect(body[0]).toMatchObject({ id: "r1", zoneId: "zone-1", depthLevel: "knee" });
  });
});
