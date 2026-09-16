import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { payloadOf, dispatchQueued } from "./dispatchers";
import { enqueue } from "./outbox";

beforeEach(() => {
  localStorage.clear();
});

describe("payloadOf", () => {
  it("narrows a payload when the operation matches", () => {
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "safe" });

    expect(payloadOf(entry, "recordCheckIn")).toEqual({ zoneId: "zone-1", status: "safe" });
  });

  it("returns undefined for an entry of a different operation", () => {
    // A store merging its own queued writes must never render another
    // store's entry as one of its own. Before six operations shared this
    // queue, a merge could filter on nothing and be right by accident.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    expect(payloadOf(entry, "recordCheckIn")).toBeUndefined();
  });
});

describe("dispatchQueued", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Every operation now shares one wire — the route-checked endpoint — so
  // there is no longer a per-operation branch here that can be missing one:
  // an operation with no runner behind /api/outbox/<operation> is refused
  // there (404 → permanent, unknown_operation — see route.test.ts and
  // send.test.ts's matching mapping), not by a dispatcher throwing "no
  // dispatcher for" the way the old per-op dispatch table did. What this
  // still needs to prove is that dispatchQueued actually wires an entry
  // through to that endpoint rather than doing nothing.
  it("sends the entry through the outbox route and returns its mapped outcome", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ result: "delivered" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    await expect(dispatchQueued(entry)).resolves.toEqual({ result: "delivered" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/outbox/submitWaterLevelReport",
      expect.objectContaining({ method: "POST" })
    );
  });
});
