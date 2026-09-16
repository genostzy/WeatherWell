import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const ORIGIN = "https://weatherwell.test";

/**
 * This route is the security boundary that stops one person's queued write
 * being sent as another's on a shared phone (see the module doc on `POST`
 * below). Every case here drives the real handler; only the Supabase client
 * and the Server Action modules it dynamically imports are faked.
 */
const getClaims = vi.fn();
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims } }),
}));

const submitWaterLevelReport = vi.fn();
vi.mock("@/app/actions/submit-water-level-report", () => ({
  submitWaterLevelReport: (...args: unknown[]) => submitWaterLevelReport(...args),
}));

const recordCheckIn = vi.fn();
vi.mock("@/app/actions/record-check-in", () => ({
  recordCheckIn: (...args: unknown[]) => recordCheckIn(...args),
}));

const createPin = vi.fn();
const editPin = vi.fn();
const deleteOwnPin = vi.fn();
const setPinRemoved = vi.fn();
vi.mock("@/app/actions/pins", () => ({
  createPin: (...args: unknown[]) => createPin(...args),
  editPin: (...args: unknown[]) => editPin(...args),
  deleteOwnPin: (...args: unknown[]) => deleteOwnPin(...args),
  setPinRemoved: (...args: unknown[]) => setPinRemoved(...args),
}));

const voteOnPin = vi.fn();
vi.mock("@/app/actions/vote-on-pin", () => ({
  voteOnPin: (...args: unknown[]) => voteOnPin(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
});

async function post(operation: string, body: unknown) {
  const { POST } = await import("./route");
  const request = new NextRequest(`${ORIGIN}/api/outbox/${operation}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ operation }) });
}

const reportPayload = { zoneId: "zone-1", depthLevel: "knee" };

describe("POST /api/outbox/[operation]", () => {
  it("refuses an unknown operation with 404, never touching auth", async () => {
    const response = await post("notAnOperation", {
      id: "e1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: {},
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ result: "permanent", reason: "unknown_operation" });
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("refuses a body missing id", async () => {
    const response = await post("submitWaterLevelReport", {
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ result: "permanent", reason: "invalid" });
    expect(submitWaterLevelReport).not.toHaveBeenCalled();
  });

  it("refuses a body missing payload", async () => {
    const response = await post("submitWaterLevelReport", {
      id: "e1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ result: "permanent", reason: "invalid" });
  });

  it("answers signed_out with no claims, and never calls the action", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const response = await post("submitWaterLevelReport", {
      id: "e1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ result: "signed_out" });
    expect(submitWaterLevelReport).not.toHaveBeenCalled();
  });

  it("holds an entry whose userId differs from the signed-in user, without calling the action", async () => {
    const response = await post("submitWaterLevelReport", {
      id: "e1",
      userId: "someone-else",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ result: "held" });
    expect(submitWaterLevelReport).not.toHaveBeenCalled();
  });

  it("holds an unowned entry (userId: null): the page's claim step goes first, not this route", async () => {
    const response = await post("submitWaterLevelReport", {
      id: "e1",
      userId: null,
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ result: "held" });
    expect(submitWaterLevelReport).not.toHaveBeenCalled();
  });

  it("delivers a report, calling the action with the payload plus madeAt: queuedAt", async () => {
    submitWaterLevelReport.mockResolvedValue({ ok: true });

    const response = await post("submitWaterLevelReport", {
      id: "e1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: "delivered" });
    expect(submitWaterLevelReport).toHaveBeenCalledWith({
      id: "e1",
      zoneId: "zone-1",
      depthLevel: "knee",
      madeAt: "2026-09-16T00:00:00.000Z",
    });
  });

  it("calls recordCheckIn with madeAt: queuedAt", async () => {
    recordCheckIn.mockResolvedValue({ ok: true });

    await post("recordCheckIn", {
      id: "c1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: { zoneId: "zone-1", status: "safe" },
    });

    expect(recordCheckIn).toHaveBeenCalledWith({
      id: "c1",
      zoneId: "zone-1",
      status: "safe",
      madeAt: "2026-09-16T00:00:00.000Z",
    });
  });

  it("calls createPin without madeAt", async () => {
    createPin.mockResolvedValue({ ok: true });

    await post("createPin", {
      id: "pin-1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: { zoneId: "zone-1", statusTag: "flooded", caption: "Knee-deep", lat: 16.06, lng: 120.4 },
    });

    expect(createPin).toHaveBeenCalledWith({
      id: "pin-1",
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Knee-deep",
      lat: 16.06,
      lng: 120.4,
    });
  });

  it("calls voteOnPin without madeAt", async () => {
    voteOnPin.mockResolvedValue({ ok: true });

    await post("voteOnPin", {
      id: "vote-1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: { pinId: "pin-1", direction: 1 },
    });

    expect(voteOnPin).toHaveBeenCalledWith({ pinId: "pin-1", direction: 1 });
  });

  it("maps a too_old permanent refusal to 422 with that reason", async () => {
    submitWaterLevelReport.mockResolvedValue({
      ok: false,
      permanent: true,
      reason: "too_old",
      error: "report too old",
    });

    const response = await post("submitWaterLevelReport", {
      id: "e1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ result: "permanent", reason: "too_old" });
  });

  it("maps a permanent refusal with no reason field to its error text", async () => {
    submitWaterLevelReport.mockResolvedValue({ ok: false, permanent: true, error: "x" });

    const response = await post("submitWaterLevelReport", {
      id: "e1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ result: "permanent", reason: "x" });
  });

  it("maps a transient refusal to 503 retry", async () => {
    submitWaterLevelReport.mockResolvedValue({ ok: false, permanent: false, error: "no session yet" });

    const response = await post("submitWaterLevelReport", {
      id: "e1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ result: "retry" });
  });

  it("maps a thrown error to 503 retry, leaking no error text into the body", async () => {
    submitWaterLevelReport.mockRejectedValue(new Error("db connection reset: password=hunter2"));

    const response = await post("submitWaterLevelReport", {
      id: "e1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ result: "retry" });
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("carries Cache-Control: no-store on every response, success or failure", async () => {
    submitWaterLevelReport.mockResolvedValue({ ok: true });

    const delivered = await post("submitWaterLevelReport", {
      id: "e1",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });
    const unknownOp = await post("notAnOperation", {
      id: "e2",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: {},
    });
    const held = await post("submitWaterLevelReport", {
      id: "e3",
      userId: "someone-else",
      queuedAt: "2026-09-16T00:00:00.000Z",
      payload: reportPayload,
    });

    for (const response of [delivered, unknownOp, held]) {
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("never calls getSession — this route trusts only getClaims, whose session is always current", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "api", "outbox", "[operation]", "route.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/getSession\(/);
  });
});
