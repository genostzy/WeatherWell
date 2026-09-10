import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ from }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * A check-in names a person and says whether they need help — the one
 * response in this app that must never be cached. RLS scopes which ROWS a
 * caller sees; it has no opinion about who an HTTP cache hands the finished
 * response to, so this header must be present on every path out of this
 * handler, success or failure, not just the happy one.
 */
describe("GET /api/check-ins", () => {
  it("carries a no-store Cache-Control header on success", async () => {
    from.mockReturnValue({
      select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate, private");
  });

  it("carries the same no-store Cache-Control header on a 502", async () => {
    // A 502 body is not sensitive, but a route with a conditional privacy
    // header is a route where the condition eventually gets it wrong — so
    // this is pinned as its own case rather than assumed from the success one.
    from.mockReturnValue({
      select: () => ({
        order: () => ({ limit: () => Promise.resolve({ data: null, error: { message: "db down" } }) }),
      }),
    });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate, private");
  });

  it("maps server rows to the client shape, attributing each row to its user_id", async () => {
    from.mockReturnValue({
      select: () => ({
        order: () => ({
          limit: () =>
            Promise.resolve({
              data: [
                {
                  id: "c1",
                  zone_id: "zone-1",
                  user_id: "user-1",
                  status: "needs_help",
                  checked_in_at: "2026-09-10T00:00:00.000Z",
                },
              ],
              error: null,
            }),
        }),
      }),
    });
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual([
      {
        id: "c1",
        zoneId: "zone-1",
        userId: "user-1",
        status: "needs_help",
        checkedInAt: "2026-09-10T00:00:00.000Z",
      },
    ]);
  });
});
