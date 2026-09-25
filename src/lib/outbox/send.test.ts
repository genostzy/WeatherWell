import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEntry } from "./send";
import type { OutboxEntry } from "./types";

const entry: OutboxEntry = {
  id: "e1",
  operation: "submitWaterLevelReport",
  payload: { zoneId: "zone-1", depthLevel: "knee" },
  queuedAt: "2026-09-16T00:00:00.000Z",
  attempts: 0,
  userId: "user-1",
  status: "pending",
  nextAttemptAt: null,
  updatedAt: "2026-09-16T00:00:00.000Z",
};

function fetchResolving(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendEntry", () => {
  it("POSTs to /api/outbox/<operation> with the entry's own fields, plus the device clock at send as sentAt", async () => {
    const fetchMock = fetchResolving(200);
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T00:07:00.000Z"));

    try {
      await sendEntry(entry);
    } finally {
      vi.useRealTimers();
    }

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/outbox/submitWaterLevelReport",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      id: "e1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      // The device's own clock, read at send time: the route trusts only the
      // interval sentAt - queuedAt, both measured on this one clock (R6).
      sentAt: "2026-09-16T00:07:00.000Z",
      payload: { zoneId: "zone-1", depthLevel: "knee" },
    });
  });

  it("sends userId: null for an unowned entry rather than omitting it", async () => {
    const fetchMock = fetchResolving(200);
    vi.stubGlobal("fetch", fetchMock);

    await sendEntry({ ...entry, userId: null });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string).userId).toBeNull();
  });

  it("maps 200 to delivered", async () => {
    vi.stubGlobal("fetch", fetchResolving(200, { result: "delivered" }));
    await expect(sendEntry(entry)).resolves.toEqual({ result: "delivered" });
  });

  it("maps 409 to held", async () => {
    vi.stubGlobal("fetch", fetchResolving(409, { result: "held" }));
    await expect(sendEntry(entry)).resolves.toEqual({ result: "held" });
  });

  it("maps 401 to signed_out", async () => {
    vi.stubGlobal("fetch", fetchResolving(401, { result: "signed_out" }));
    await expect(sendEntry(entry)).resolves.toEqual({ result: "signed_out" });
  });

  it("maps 422 to permanent with the body's reason", async () => {
    vi.stubGlobal("fetch", fetchResolving(422, { result: "permanent", reason: "too_old" }));
    await expect(sendEntry(entry)).resolves.toEqual({ result: "permanent", reason: "too_old" });
  });

  it("maps 404 to permanent with reason unknown_operation", async () => {
    vi.stubGlobal("fetch", fetchResolving(404, { result: "permanent", reason: "unknown_operation" }));
    await expect(sendEntry(entry)).resolves.toEqual({ result: "permanent", reason: "unknown_operation" });
  });

  it("maps a 503 that names its reason to retry with that reason", async () => {
    vi.stubGlobal("fetch", fetchResolving(503, { result: "retry", reason: "rate_limited" }));
    await expect(sendEntry(entry)).resolves.toEqual({ result: "retry", reason: "rate_limited" });
  });

  it("maps an unexpected status to retry", async () => {
    vi.stubGlobal("fetch", fetchResolving(500, {}));
    await expect(sendEntry(entry)).resolves.toEqual({ result: "retry" });
  });

  it("maps a network error to retry, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(sendEntry(entry)).resolves.toEqual({ result: "retry" });
  });

  it("maps a 422 whose body cannot be parsed to permanent with no reason, rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 422, json: () => Promise.reject(new Error("bad json")) })
    );
    await expect(sendEntry(entry)).resolves.toEqual({ result: "permanent", reason: undefined });
  });
});
