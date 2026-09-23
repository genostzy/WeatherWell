import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({
  default: { sendNotification, setVapidDetails },
}));

const deleteEq = vi.fn();
const selectEq = vi.fn();
const from = vi.fn(() => ({
  select: vi.fn(() => ({ eq: selectEq })),
  delete: vi.fn(() => ({ eq: deleteEq })),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from })),
}));

const VALID_PAYLOAD = { zoneId: "zone-1", title: "Alert", body: "Flooding reported" };

describe("sendZonePush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectEq.mockResolvedValue({ data: [], error: null });
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
    // reaching the query this builds could alter which rows
    // it matches — this is the input check that stands in for parameterizing
    // that call.
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush({ ...VALID_PAYLOAD, zoneId: "zone-1,zone_id.eq.zone-2" });

    expect(result).toEqual({ ok: false, error: "Invalid zoneId", status: 400 });
    expect(selectEq).not.toHaveBeenCalled();
  });

  it("reports not-configured rather than sending with no VAPID keys", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "Push notifications not configured", status: 503 });
    expect(selectEq).not.toHaveBeenCalled();
  });

  it("sends only to the zone's own subscribers, never to zone-less ones", async () => {
    const sendZonePush = await freshSendZonePush();

    await sendZonePush(VALID_PAYLOAD);

    expect(selectEq).toHaveBeenCalledWith("zone_id", "zone-1");
  });

  it("sends to every subscription returned for the zone", async () => {
    selectEq.mockResolvedValue({
      data: [
        { endpoint: "https://fcm.googleapis.com/fcm/send/a", p256dh: "p1", auth: "a1" },
        { endpoint: "https://fcm.googleapis.com/fcm/send/b", p256dh: "p2", auth: "a2" },
      ],
      error: null,
    });
    sendNotification.mockResolvedValue(undefined);
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: true, sent: 2, failed: 0, total: 2 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("never contacts an endpoint outside the known push services, and drops it (I5)", async () => {
    selectEq.mockResolvedValue({
      data: [
        { endpoint: "http://169.254.169.254/latest/meta-data", p256dh: "p1", auth: "a1" },
        { endpoint: "https://evil.example/fcm.googleapis.com", p256dh: "p2", auth: "a2" },
        { endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x", p256dh: "p3", auth: "a3" },
        { endpoint: "https://web.push.apple.com/abc", p256dh: "p4", auth: "a4" },
        { endpoint: "https://wns2-par02p.notify.windows.com/w/?token=x", p256dh: "p5", auth: "a5" },
      ],
      error: null,
    });
    sendNotification.mockResolvedValue(undefined);
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: true, sent: 3, failed: 2, total: 5 });
    const contacted = sendNotification.mock.calls.map((call) => call[0].endpoint);
    expect(contacted).not.toContain("http://169.254.169.254/latest/meta-data");
    expect(contacted).not.toContain("https://evil.example/fcm.googleapis.com");
    expect(deleteEq).toHaveBeenCalledWith("endpoint", "http://169.254.169.254/latest/meta-data");
    expect(deleteEq).toHaveBeenCalledWith("endpoint", "https://evil.example/fcm.googleapis.com");
  });

  it("gives every send a timeout so one stalled push service cannot hang the run (I5)", async () => {
    selectEq.mockResolvedValue({
      data: [{ endpoint: "https://fcm.googleapis.com/fcm/send/a", p256dh: "p1", auth: "a1" }],
      error: null,
    });
    sendNotification.mockResolvedValue(undefined);
    const sendZonePush = await freshSendZonePush();

    await sendZonePush(VALID_PAYLOAD);

    expect(sendNotification.mock.calls[0][2]).toMatchObject({ timeout: expect.any(Number) });
  });

  it("removes a subscription that reports itself expired (410) instead of retrying it forever", async () => {
    selectEq.mockResolvedValue({
      data: [{ endpoint: "https://fcm.googleapis.com/fcm/send/gone", p256dh: "p1", auth: "a1" }],
      error: null,
    });
    sendNotification.mockRejectedValue({ statusCode: 410 });
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: true, sent: 0, failed: 1, total: 1 });
    expect(from).toHaveBeenCalledWith("push_subscriptions");
    expect(deleteEq).toHaveBeenCalledWith("endpoint", "https://fcm.googleapis.com/fcm/send/gone");
  });

  it("keeps a subscription that failed for a reason other than expiry", async () => {
    selectEq.mockResolvedValue({
      data: [{ endpoint: "https://fcm.googleapis.com/fcm/send/flaky", p256dh: "p1", auth: "a1" }],
      error: null,
    });
    sendNotification.mockRejectedValue({ statusCode: 500 });
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: true, sent: 0, failed: 1, total: 1 });
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it("reports a query error instead of a false success", async () => {
    selectEq.mockResolvedValue({ data: null, error: { message: "connection refused" } });
    const sendZonePush = await freshSendZonePush();

    const result = await sendZonePush(VALID_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "connection refused", status: 500 });
  });
});
