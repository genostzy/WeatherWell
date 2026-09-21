import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({
  default: { sendNotification, setVapidDetails },
}));

const deleteEq = vi.fn();
const or = vi.fn();
const from = vi.fn(() => ({
  select: vi.fn(() => ({ or })),
  delete: vi.fn(() => ({ eq: deleteEq })),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from })),
}));

const VALID_PAYLOAD = { zoneId: "zone-1", title: "Alert", body: "Flooding reported" };

describe("sendZonePush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    or.mockResolvedValue({ data: [], error: null });
    // Module-level VAPID config is read once at import time (it must stay a
    // module singleton so it configures web-push exactly once) — see
    // browser.test.ts for why that forces a fresh module per test here
    // rather than a top-level import.
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function freshSendZonePush() {
    vi.resetModules();
    const mod = await import("./send-zone-push");
    return mod.sendZonePush;
  }

  it("refuses a malformed zoneId instead of building a filter string from it", async () => {
    // Zone IDs are always "zone-" plus digits or a PSGC code. Anything else
    // reaching the .or() filter string this builds could alter which rows
    // it matches — this is the input check that stands in for parameterizing
    // that call.
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush({ ...VALID_PAYLOAD, zoneId: "zone-1,zone_id.eq.zone-2" });

    expect(result).toEqual({ ok: false, error: "Invalid zoneId", status: 400 });
    expect(or).not.toHaveBeenCalled();
  });

  it("reports not-configured rather than sending with no VAPID keys", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "Push notifications not configured", status: 503 });
    expect(or).not.toHaveBeenCalled();
  });

  it("sends to every subscription returned for the zone", async () => {
    or.mockResolvedValue({
      data: [
        { endpoint: "https://push.example/a", p256dh: "p1", auth: "a1" },
        { endpoint: "https://push.example/b", p256dh: "p2", auth: "a2" },
      ],
      error: null,
    });
    sendNotification.mockResolvedValue(undefined);
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: true, sent: 2, failed: 0, total: 2 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("removes a subscription that reports itself expired (410) instead of retrying it forever", async () => {
    or.mockResolvedValue({
      data: [{ endpoint: "https://push.example/gone", p256dh: "p1", auth: "a1" }],
      error: null,
    });
    sendNotification.mockRejectedValue({ statusCode: 410 });
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: true, sent: 0, failed: 1, total: 1 });
    expect(from).toHaveBeenCalledWith("push_subscriptions");
    expect(deleteEq).toHaveBeenCalledWith("endpoint", "https://push.example/gone");
  });

  it("keeps a subscription that failed for a reason other than expiry", async () => {
    or.mockResolvedValue({
      data: [{ endpoint: "https://push.example/flaky", p256dh: "p1", auth: "a1" }],
      error: null,
    });
    sendNotification.mockRejectedValue({ statusCode: 500 });
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: true, sent: 0, failed: 1, total: 1 });
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it("reports a query error instead of a false success", async () => {
    or.mockResolvedValue({ data: null, error: { message: "connection refused" } });
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "connection refused", status: 500 });
  });
});
