import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The route imports @/lib/cron-auth, which does `import "server-only"` —
// that throws unconditionally under Vitest (see load-official.test.ts).
vi.mock("server-only", () => ({}));

const rpc = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc }),
}));

import { GET, POST } from "./route";

function request(authorization?: string): Request {
  return new Request("https://weatherwell.app/api/threshold-check", {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET and POST /api/threshold-check", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sent: 4 }) });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    global.fetch = originalFetch;
  });

  it("refuses a GET request with no cron secret, and never runs the engine", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a POST request with the wrong secret", async () => {
    const response = await POST(request("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  /**
   * The actual regression this guards: Vercel Cron always sends GET, never
   * POST, but the threshold engine used to live only in the POST handler —
   * GET was a stub that echoed static config. The scheduled cron in
   * vercel.json therefore never ran check_and_trigger_alerts() at all. GET
   * must now run the real engine, exactly like POST does.
   */
  it("GET runs the real threshold engine and sends push notifications for triggered alerts, not just an echoed config", async () => {
    rpc.mockResolvedValue({
      data: [
        { zone_id: "zone-1", severity: "danger", report_count: 4, triggered: true },
        { zone_id: "zone-2", severity: "advisory", report_count: 2, triggered: false },
      ],
      error: null,
    });

    const response = await GET(request("Bearer test-secret"));
    const body = await response.json();

    expect(rpc).toHaveBeenCalledWith("check_and_trigger_alerts");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(body.triggered).toBe(1);
    expect(body.pushSent).toBe(4);
    // Confirms this is not the old stub response shape.
    expect(body.status).toBeUndefined();
  });

  it("POST runs the same engine as GET", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const response = await POST(request("Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.triggered).toBe(0);
  });

  it("reports an engine error as a 500 rather than silently succeeding", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "rpc failed" } });

    const response = await GET(request("Bearer test-secret"));

    expect(response.status).toBe(500);
  });
});
