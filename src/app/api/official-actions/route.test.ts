import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ORIGIN = "https://weatherwell.test";

/**
 * A thenable, chainable stand-in for Supabase's PostgrestFilterBuilder.
 * Every method records its call and returns the same builder so the route's
 * conditional `.eq()` / `.in()` chaining works exactly as it does against
 * the real client, and `await`-ing the builder at any point resolves with
 * the configured result.
 */
function makeBuilder(result: { data: unknown; error: { message: string } | null }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {
    calls,
    select: (...args: unknown[]) => (calls.push({ method: "select", args }), builder),
    order: (...args: unknown[]) => (calls.push({ method: "order", args }), builder),
    limit: (...args: unknown[]) => (calls.push({ method: "limit", args }), builder),
    eq: (...args: unknown[]) => (calls.push({ method: "eq", args }), builder),
    in: (...args: unknown[]) => (calls.push({ method: "in", args }), builder),
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  return builder;
}

const from = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ from }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/official-actions", () => {
  it("selects only the eight columns the mapper needs — never actor_id", async () => {
    const builder = makeBuilder({ data: [], error: null });
    from.mockReturnValue(builder);
    const { GET } = await import("./route");

    await GET(new NextRequest(`${ORIGIN}/api/official-actions`));

    const selectCall = (builder.calls as { method: string; args: unknown[] }[]).find(
      (c) => c.method === "select"
    );
    expect(selectCall?.args[0]).toBe(
      "id, occurred_at, actor_name, actor_area, action, zone_id, target_id, detail"
    );
  });

  it("filters by zone when ?zone= is present", async () => {
    const builder = makeBuilder({ data: [], error: null });
    from.mockReturnValue(builder);
    const { GET } = await import("./route");

    await GET(new NextRequest(`${ORIGIN}/api/official-actions?zone=zone-1`));

    expect(builder.calls).toContainEqual({ method: "eq", args: ["zone_id", "zone-1"] });
  });

  it("does not filter by zone when ?zone= is absent", async () => {
    const builder = makeBuilder({ data: [], error: null });
    from.mockReturnValue(builder);
    const { GET } = await import("./route");

    await GET(new NextRequest(`${ORIGIN}/api/official-actions`));

    expect((builder.calls as { method: string }[]).some((c) => c.method === "eq")).toBe(false);
  });

  it("filters to alert.set/alert.cleared when ?kind=alert is present", async () => {
    const builder = makeBuilder({ data: [], error: null });
    from.mockReturnValue(builder);
    const { GET } = await import("./route");

    await GET(new NextRequest(`${ORIGIN}/api/official-actions?kind=alert`));

    expect(builder.calls).toContainEqual({
      method: "in",
      args: ["action", ["alert.set", "alert.cleared"]],
    });
  });

  it("does not filter by kind for any other value", async () => {
    const builder = makeBuilder({ data: [], error: null });
    from.mockReturnValue(builder);
    const { GET } = await import("./route");

    await GET(new NextRequest(`${ORIGIN}/api/official-actions?kind=pin`));

    expect((builder.calls as { method: string }[]).some((c) => c.method === "in")).toBe(false);
  });

  it("defaults limit to 50", async () => {
    const builder = makeBuilder({ data: [], error: null });
    from.mockReturnValue(builder);
    const { GET } = await import("./route");

    await GET(new NextRequest(`${ORIGIN}/api/official-actions`));

    expect(builder.calls).toContainEqual({ method: "limit", args: [50] });
  });

  it("clamps a limit above 200 down to 200", async () => {
    const builder = makeBuilder({ data: [], error: null });
    from.mockReturnValue(builder);
    const { GET } = await import("./route");

    await GET(new NextRequest(`${ORIGIN}/api/official-actions?limit=9000`));

    expect(builder.calls).toContainEqual({ method: "limit", args: [200] });
  });

  it("clamps a negative limit up to 1", async () => {
    const builder = makeBuilder({ data: [], error: null });
    from.mockReturnValue(builder);
    const { GET } = await import("./route");

    await GET(new NextRequest(`${ORIGIN}/api/official-actions?limit=-5`));

    expect(builder.calls).toContainEqual({ method: "limit", args: [1] });
  });

  it("falls back to the default of 50 for a limit of 0 (falsy, not a deliberate zero)", async () => {
    const builder = makeBuilder({ data: [], error: null });
    from.mockReturnValue(builder);
    const { GET } = await import("./route");

    await GET(new NextRequest(`${ORIGIN}/api/official-actions?limit=0`));

    expect(builder.calls).toContainEqual({ method: "limit", args: [50] });
  });

  it("clamps a non-numeric limit to the default of 50", async () => {
    const builder = makeBuilder({ data: [], error: null });
    from.mockReturnValue(builder);
    const { GET } = await import("./route");

    await GET(new NextRequest(`${ORIGIN}/api/official-actions?limit=not-a-number`));

    expect(builder.calls).toContainEqual({ method: "limit", args: [50] });
  });

  it("maps rows through toOfficialActions on success", async () => {
    from.mockReturnValue(
      makeBuilder({
        data: [
          {
            id: 1,
            occurred_at: "2026-09-14T02:14:00.000Z",
            actor_name: "Juan Dela Cruz",
            actor_area: "0199901001",
            action: "alert.set",
            zone_id: "zone-1",
            target_id: "alert-1",
            detail: { from: "orange", to: "yellow" },
          },
        ],
        error: null,
      })
    );
    const { GET } = await import("./route");

    const response = await GET(new NextRequest(`${ORIGIN}/api/official-actions`));
    const body = await response.json();

    expect(body).toEqual([
      {
        id: 1,
        occurredAt: "2026-09-14T02:14:00.000Z",
        actorName: "Juan Dela Cruz",
        actorArea: "0199901001",
        action: "alert.set",
        zoneId: "zone-1",
        targetId: "alert-1",
        detail: { from: "orange", to: "yellow" },
      },
    ]);
  });

  it("returns 502 with the error message on failure", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: { message: "db down" } }));
    const { GET } = await import("./route");

    const response = await GET(new NextRequest(`${ORIGIN}/api/official-actions`));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "db down" });
  });

  it("carries a no-store Cache-Control header on success", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));
    const { GET } = await import("./route");

    const response = await GET(new NextRequest(`${ORIGIN}/api/official-actions`));

    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("carries the same no-store Cache-Control header on a 502", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: { message: "db down" } }));
    const { GET } = await import("./route");

    const response = await GET(new NextRequest(`${ORIGIN}/api/official-actions`));

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });
});
