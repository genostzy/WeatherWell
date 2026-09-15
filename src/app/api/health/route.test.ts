import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * A thenable, chainable stand-in for Supabase's PostgrestFilterBuilder,
 * matching the pattern in src/app/api/official-actions/route.test.ts.
 */
function makeBuilder(result: { data: unknown; error: { message: string } | null } | Promise<never>) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    limit: () => (result instanceof Promise ? result : Promise.resolve(result)),
  };
  return builder;
}

const from = vi.fn();
const rpc = vi.fn();
const createSupabaseServerClient = vi.fn(() => ({ from, rpc }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  createSupabaseServerClient.mockImplementation(() => ({ from, rpc }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/health", () => {
  it("reports ok with the recent error count when both checks succeed", async () => {
    from.mockReturnValue(makeBuilder({ data: [{ id: "zone-1" }], error: null }));
    rpc.mockResolvedValue({ data: 2, error: null });
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", database: "ok", recentErrors: 2 });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("reports unavailable without leaking the database error message", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: { message: "db down: secret detail" } }));
    rpc.mockResolvedValue({ data: 0, error: null });
    const { GET } = await import("./route");

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain("secret detail");
    expect(JSON.parse(text)).toEqual({ status: "unavailable" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("reports unavailable when the zones read hangs past the timeout", async () => {
    vi.useFakeTimers();
    from.mockReturnValue(makeBuilder(new Promise(() => {})));
    rpc.mockResolvedValue({ data: 0, error: null });
    const { GET } = await import("./route");

    const responsePromise = GET();
    await vi.advanceTimersByTimeAsync(5000);
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "unavailable" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("reports ok with recentErrors 0 when the count RPC hangs past the timeout", async () => {
    // Only an errored (rejected/error-populated) RPC response was covered
    // before. A regression that replaced withTimeout(supabase.rpc(...)) with
    // a bare await would hang the whole response on a stuck RPC; this pins
    // that the inner withTimeout is what actually bounds it.
    vi.useFakeTimers();
    from.mockReturnValue(makeBuilder({ data: [{ id: "zone-1" }], error: null }));
    rpc.mockReturnValue(new Promise(() => {}));
    const { GET } = await import("./route");

    const responsePromise = GET();
    await vi.advanceTimersByTimeAsync(5000);
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", database: "ok", recentErrors: 0 });
  });

  it("still reports ok with recentErrors 0 when the count RPC errors", async () => {
    from.mockReturnValue(makeBuilder({ data: [{ id: "zone-1" }], error: null }));
    rpc.mockResolvedValue({ data: null, error: { message: "function not found" } });
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", database: "ok", recentErrors: 0 });
  });

  it("reports unavailable when the client factory throws (missing env)", async () => {
    createSupabaseServerClient.mockImplementation(() => {
      throw new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
    });
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "unavailable" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
