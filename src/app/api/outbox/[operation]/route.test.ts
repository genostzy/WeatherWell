import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

const reportError = vi.fn();
vi.mock("@/lib/monitoring/report", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
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

  it.each([
    ["an unparseable string", "not a date"],
    ["an empty string", ""],
    ["a number", 1726444800000],
    ["null", null],
  ])(
    "refuses a queuedAt that is %s as permanent invalid, rather than retrying it ten times (Minor 6)",
    async (_label, queuedAt) => {
      const response = await post("submitWaterLevelReport", {
        id: "e1",
        userId: "user-1",
        queuedAt,
        payload: reportPayload,
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ result: "permanent", reason: "invalid" });
      expect(submitWaterLevelReport).not.toHaveBeenCalled();
    }
  );

  it("refuses a body with no queuedAt at all as permanent invalid (Minor 6)", async () => {
    const response = await post("recordCheckIn", {
      id: "c1",
      userId: "user-1",
      payload: { zoneId: "zone-1", status: "safe" },
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ result: "permanent", reason: "invalid" });
    expect(recordCheckIn).not.toHaveBeenCalled();
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

  describe("made-at time: only the elapsed interval on the device's clock is trusted (R6)", () => {
    // The server's own clock at arrival. Every case below reads madeAt as
    // serverNow - max(0, sentAt - queuedAt), so the device's absolute clock
    // never reaches the database.
    const SERVER_NOW = "2026-09-16T12:00:00.000Z";
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

    /** What the database trigger does with a report over 6 hours old. */
    async function likeTheReportTrigger({ madeAt }: { madeAt: string }) {
      return Date.parse(madeAt) < Date.parse(SERVER_NOW) - SIX_HOURS_MS
        ? { ok: false, permanent: true, reason: "too_old", error: "report too old" }
        : { ok: true };
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(SERVER_NOW));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("delivers a report, calling the action with the payload plus madeAt translated to server time", async () => {
      submitWaterLevelReport.mockResolvedValue({ ok: true });

      // Queued 5 minutes before it was sent, on a device clock that happens
      // to be 3 hours behind the server's.
      const response = await post("submitWaterLevelReport", {
        id: "e1",
        userId: "user-1",
        queuedAt: "2026-09-16T08:55:00.000Z",
        sentAt: "2026-09-16T09:00:00.000Z",
        payload: reportPayload,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ result: "delivered" });
      expect(submitWaterLevelReport).toHaveBeenCalledWith({
        id: "e1",
        zoneId: "zone-1",
        depthLevel: "knee",
        madeAt: "2026-09-16T11:55:00.000Z",
      });
    });

    it("calls recordCheckIn with madeAt translated to server time", async () => {
      recordCheckIn.mockResolvedValue({ ok: true });

      await post("recordCheckIn", {
        id: "c1",
        userId: "user-1",
        queuedAt: "2026-09-16T00:00:00.000Z",
        sentAt: "2026-09-16T02:00:00.000Z",
        payload: { zoneId: "zone-1", status: "safe" },
      });

      expect(recordCheckIn).toHaveBeenCalledWith({
        id: "c1",
        zoneId: "zone-1",
        status: "safe",
        madeAt: "2026-09-16T10:00:00.000Z",
      });
    });

    it("accepts a report from a phone whose clock is 10 hours slow, sent immediately: madeAt is server now", async () => {
      submitWaterLevelReport.mockImplementation(likeTheReportTrigger);

      const response = await post("submitWaterLevelReport", {
        id: "e-slow-clock",
        userId: "user-1",
        queuedAt: "2026-09-16T02:00:00.000Z",
        sentAt: "2026-09-16T02:00:00.000Z",
        payload: reportPayload,
      });

      expect(submitWaterLevelReport).toHaveBeenCalledWith(expect.objectContaining({ madeAt: SERVER_NOW }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ result: "delivered" });
    });

    it("dates a report queued 7 real hours ago 7 hours before server now, so it is refused as too old", async () => {
      submitWaterLevelReport.mockImplementation(likeTheReportTrigger);

      // A device clock 2 hours FAST: the absolute values are wrong, the
      // 7-hour interval between them is not.
      const response = await post("submitWaterLevelReport", {
        id: "e-seven-hours",
        userId: "user-1",
        queuedAt: "2026-09-16T07:00:00.000Z",
        sentAt: "2026-09-16T14:00:00.000Z",
        payload: reportPayload,
      });

      expect(submitWaterLevelReport).toHaveBeenCalledWith(
        expect.objectContaining({ madeAt: "2026-09-16T05:00:00.000Z" })
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ result: "permanent", reason: "too_old" });
    });

    it.each([
      ["missing", undefined],
      ["not a date", "yesterday"],
      ["a number", 1726444800000],
      ["null", null],
    ])("falls back to arrival time when sentAt is %s", async (_label, sentAt) => {
      recordCheckIn.mockResolvedValue({ ok: true });

      const response = await post("recordCheckIn", {
        id: "c1",
        userId: "user-1",
        queuedAt: "2026-09-15T00:00:00.000Z",
        ...(sentAt === undefined ? {} : { sentAt }),
        payload: { zoneId: "zone-1", status: "safe" },
      });

      expect(response.status).toBe(200);
      expect(recordCheckIn).toHaveBeenCalledWith(expect.objectContaining({ madeAt: SERVER_NOW }));
    });

    it("clamps a negative interval (sentAt before queuedAt: the device clock was set back) to zero", async () => {
      submitWaterLevelReport.mockResolvedValue({ ok: true });

      await post("submitWaterLevelReport", {
        id: "e1",
        userId: "user-1",
        queuedAt: "2026-09-16T09:00:00.000Z",
        sentAt: "2026-09-16T08:00:00.000Z",
        payload: reportPayload,
      });

      expect(submitWaterLevelReport).toHaveBeenCalledWith(expect.objectContaining({ madeAt: SERVER_NOW }));
    });

    it("never passes a made-at time to the pin, vote or moderation actions", async () => {
      createPin.mockResolvedValue({ ok: true });

      await post("createPin", {
        id: "pin-1",
        userId: "user-1",
        queuedAt: "2026-09-16T00:00:00.000Z",
        sentAt: "2026-09-16T05:00:00.000Z",
        payload: { zoneId: "zone-1", statusTag: "flooded", caption: "x", lat: 1, lng: 2 },
      });

      expect(createPin).toHaveBeenCalledWith({
        id: "pin-1",
        zoneId: "zone-1",
        statusTag: "flooded",
        caption: "x",
        lat: 1,
        lng: 2,
      });
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

  describe("a server crash on the write path is reported to monitoring (I-5)", () => {
    // Distinctive values, so any leak into the report is unmistakable.
    const secretBody = {
      id: "entry-id-5f1c",
      userId: "user-1",
      queuedAt: "2026-09-16T00:00:00.000Z",
      sentAt: "2026-09-16T00:00:00.000Z",
      payload: { zoneId: "zone-secret-7731", depthLevel: "knee", caption: "near 14.5995,120.9842" },
    };

    it("reports the thrown error with only the route, before answering 503", async () => {
      const crash = new TypeError("Cannot read properties of undefined (reading 'from')");
      submitWaterLevelReport.mockRejectedValue(crash);
      let finishReport!: () => void;
      reportError.mockReturnValue(
        new Promise<void>((resolve) => {
          finishReport = resolve;
        })
      );

      let settled = false;
      const pending = post("submitWaterLevelReport", secretBody).then((response) => {
        settled = true;
        return response;
      });

      await vi.waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
      expect(reportError).toHaveBeenCalledWith(crash, {
        source: "server",
        kind: "request",
        route: "/api/outbox/submitWaterLevelReport",
      });
      // The report is awaited: on a serverless platform, work left running
      // after the response is sent can be cut off.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(settled).toBe(false);

      finishReport();
      const response = await pending;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ result: "retry" });
    });

    it("never passes anything from the request body to the report", async () => {
      submitWaterLevelReport.mockRejectedValue(new Error("db connection reset"));
      reportError.mockResolvedValue(undefined);

      await post("submitWaterLevelReport", secretBody);

      expect(reportError).toHaveBeenCalledTimes(1);
      const [error, options] = reportError.mock.calls[0] as [Error, Record<string, unknown>];
      const everything = [String(error), error.message, error.stack ?? "", JSON.stringify(options)].join(" | ");
      for (const value of [
        secretBody.id,
        secretBody.queuedAt,
        secretBody.payload.zoneId,
        secretBody.payload.caption,
        "14.5995",
      ]) {
        expect(everything).not.toContain(value);
      }
      expect(Object.keys(options).sort()).toEqual(["kind", "route", "source"]);
    });

    it("does not report an ordinary refusal: only a throw is a crash", async () => {
      submitWaterLevelReport.mockResolvedValue({ ok: false, permanent: false, error: "no session yet" });
      recordCheckIn.mockResolvedValue({ ok: false, permanent: true, error: "check-in too old" });

      await post("submitWaterLevelReport", secretBody);
      await post("recordCheckIn", { ...secretBody, payload: { zoneId: "zone-1", status: "safe" } });

      expect(reportError).not.toHaveBeenCalled();
    });

    it("still answers 503 when reporting itself fails", async () => {
      submitWaterLevelReport.mockRejectedValue(new Error("boom"));
      reportError.mockRejectedValue(new Error("monitoring is down"));

      const response = await post("submitWaterLevelReport", secretBody);

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ result: "retry" });
    });
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

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"])(
    "refuses the inherited object key %s as an unknown operation, never touching auth",
    async (operation) => {
      const response = await post(operation, { id: "e1", userId: "user-1", queuedAt: "2026-09-16T00:00:00.000Z", payload: {} });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ result: "permanent", reason: "unknown_operation" });
      expect(getClaims).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["submitWaterLevelReport", () => submitWaterLevelReport, { zoneId: "zone-1", depthLevel: "knee" }],
    ["recordCheckIn", () => recordCheckIn, { zoneId: "zone-1", status: "safe" }],
    ["createPin", () => createPin, { zoneId: "zone-1", statusTag: "flooded", caption: "x", lat: 1, lng: 2 }],
  ] as const)(
    "keeps the queue's own entry id for %s even when the payload carries a different id",
    async (operation, action, payload) => {
      action().mockResolvedValue({ ok: true });
      const response = await post(operation, {
        id: "entry-id",
        userId: "user-1",
        queuedAt: "2026-09-16T00:00:00.000Z",
        payload: { ...payload, id: "attacker-id" },
      });
      expect(response.status).toBe(200);
      expect(action()).toHaveBeenCalledWith(expect.objectContaining({ id: "entry-id" }));
    }
  );

  it.each([
    ["editPin", () => editPin, { pinId: "pin-1", statusTag: "flooded", caption: "x" }],
    ["deleteOwnPin", () => deleteOwnPin, { pinId: "pin-1" }],
    ["setPinRemoved", () => setPinRemoved, { pinId: "pin-1", removed: true, reason: "admin" }],
  ] as const)("calls %s with exactly the queued payload", async (operation, action, payload) => {
    action().mockResolvedValue({ ok: true });
    const response = await post(operation, { id: "e1", userId: "user-1", queuedAt: "2026-09-16T00:00:00.000Z", payload });
    expect(response.status).toBe(200);
    expect(action()).toHaveBeenCalledWith(payload);
  });

  it("never calls getSession — this route trusts only getClaims, whose session is always current", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "api", "outbox", "[operation]", "route.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/getSession\(/);
  });
});
