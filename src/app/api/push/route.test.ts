import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The route imports @/lib/cron-auth, which does `import "server-only"` —
// that throws unconditionally under Vitest (see load-official.test.ts).
vi.mock("server-only", () => ({}));

// vi.mock is hoisted above ordinary `const`s in this file, so a plain
// `const sendZonePush = vi.fn()` referenced inside the factory below would
// hit "Cannot access before initialization". vi.hoisted runs in that same
// hoisted phase, so the factory can see an already-initialized mock.
const { sendZonePush } = vi.hoisted(() => ({ sendZonePush: vi.fn() }));
vi.mock("@/lib/send-zone-push", () => ({ sendZonePush }));

import { GET, POST } from "./route";

function request(body: unknown, authorization?: string): Request {
  return new Request("https://weatherwell.app/api/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push", () => {
  const originalSecret = process.env.CRON_SECRET;
  const validBody = { zoneId: "zone-1", title: "Alert", body: "Flooding reported" };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    sendZonePush.mockResolvedValue({ ok: true, sent: 3, failed: 0, total: 3 });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("refuses a request with no cron secret, and never sends anything", async () => {
    // This is the actual bug: this endpoint used to accept any request from
    // anyone on the internet and push arbitrary text to a zone's
    // subscribers — the only unauthenticated write endpoint in the app.
    const response = await POST(request(validBody));

    expect(response.status).toBe(401);
    expect(sendZonePush).not.toHaveBeenCalled();
  });

  it("refuses a request with the wrong secret", async () => {
    const response = await POST(request(validBody, "Bearer wrong"));

    expect(response.status).toBe(401);
    expect(sendZonePush).not.toHaveBeenCalled();
  });

  it("sends for a correctly authorized request", async () => {
    const response = await POST(request(validBody, "Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sendZonePush).toHaveBeenCalledWith(validBody);
    expect(body).toEqual({ sent: 3, failed: 0, total: 3 });
  });

  it("rejects a missing field before calling sendZonePush", async () => {
    const response = await POST(request({ zoneId: "zone-1" }, "Bearer test-secret"));

    expect(response.status).toBe(400);
    expect(sendZonePush).not.toHaveBeenCalled();
  });

  it("surfaces sendZonePush's own error status", async () => {
    sendZonePush.mockResolvedValue({ ok: false, error: "not configured", status: 503 });

    const response = await POST(request(validBody, "Bearer test-secret"));

    expect(response.status).toBe(503);
  });
});

describe("GET /api/push", () => {
  it("reports unsupported with no VAPID keys configured", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.supported).toBe(false);
    expect(body.publicKey).toBeNull();
  });
});
