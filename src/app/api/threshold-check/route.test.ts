import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The route imports @/lib/cron-auth, which does `import "server-only"` —
// that throws unconditionally under Vitest (see load-official.test.ts).
vi.mock("server-only", () => ({}));

const rpc = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc }),
}));

// See push/route.test.ts's comment on this same pattern: vi.hoisted keeps
// this mock fn in the same hoisted phase as vi.mock itself.
const { sendZonePush } = vi.hoisted(() => ({ sendZonePush: vi.fn() }));
vi.mock("@/lib/send-zone-push", () => ({ sendZonePush }));

import { GET, POST } from "./route";

function request(authorization?: string): Request {
  return new Request("https://weatherwell.app/api/threshold-check", {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET and POST /api/threshold-check", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    sendZonePush.mockResolvedValue({ ok: true, sent: 4, failed: 0, total: 4 });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
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
    // Called directly, not over HTTP — see sendZonePush's own doc comment
    // for the reliability/security bug that HTTP hop used to be.
    expect(sendZonePush).toHaveBeenCalledTimes(1);
    expect(sendZonePush).toHaveBeenCalledWith(
      expect.objectContaining({
        zoneId: "zone-1",
        title: "WeatherWell Advisory (unverified)",
        body: "Residents report flooding in your area. Not yet confirmed by an official.",
      })
    );
    expect(body.triggered).toBe(1);
    expect(body.pushSent).toBe(4);
    // Confirms this is not the old stub response shape.
    expect(body.status).toBeUndefined();
  });

  it("keeps checking the rest of the triggered alerts when one zone's push fails", async () => {
    rpc.mockResolvedValue({
      data: [
        { zone_id: "zone-1", severity: "danger", report_count: 4, triggered: true },
        { zone_id: "zone-2", severity: "evacuate", report_count: 5, triggered: true },
      ],
      error: null,
    });
    sendZonePush
      .mockResolvedValueOnce({ ok: false, error: "boom", status: 500 })
      .mockResolvedValueOnce({ ok: true, sent: 2, failed: 0, total: 2 });

    const response = await GET(request("Bearer test-secret"));
    const body = await response.json();

    expect(sendZonePush).toHaveBeenCalledTimes(2);
    expect(body.triggered).toBe(2);
    // Only the second zone's successful send counts.
    expect(body.pushSent).toBe(2);
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
