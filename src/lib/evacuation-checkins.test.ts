import { describe, it, expect, beforeEach, vi } from "vitest";

// evacuation-checkins.ts calls ensureAnonymousSession from triggerDrain,
// which reaches getBrowserClient and therefore readSupabaseEnv — vitest does
// not load .env.local, so the real module throws. Every test here is about
// the merge and the queue, not about signing in, so it is stubbed — same
// pattern community-pins.test.ts and water-level-reports.test.ts use.
const ensureAnonymousSession = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: () => ensureAnonymousSession(),
}));

import { enqueue, readOutbox } from "@/lib/outbox/outbox";
import {
  mergeCheckIns,
  getCheckInsForZone,
  getOwnCheckInForZone,
  recordCheckIn,
  type EvacuationCheckIn,
} from "./evacuation-checkins";

beforeEach(() => {
  localStorage.clear();
  ensureAnonymousSession.mockClear();
});

describe("mergeCheckIns", () => {
  it("shows a queued check-in immediately", () => {
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "safe" });

    const merged = mergeCheckIns([], [entry], "user-1");

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("safe");
  });

  it("replaces the caller's own earlier check-in for the same zone rather than adding one", () => {
    // The table is unique on (zone_id, user_id) and a resident is allowed to
    // change their own answer — this is the caller superseding their own row.
    const existing = {
      id: "checkin-1",
      zoneId: "zone-1",
      userId: "user-1",
      status: "safe" as const,
      checkedInAt: new Date(Date.now() - 60_000).toISOString(),
    };
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "needs_help" });

    const merged = mergeCheckIns([existing], [entry], "user-1");

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("needs_help");
  });

  it("keeps every resident's row when only one of them has a check-in queued — an operator's headcount, not a display detail", () => {
    // This is the bug: reconciling by zone alone would drop every resident's
    // row for the zone the instant ANY one of them (e.g. an operator who is
    // also a resident, checking in on their own device) has a queued write,
    // collapsing CheckInSummaryPanel's headcount down to that one pending
    // entry. Reconciling by (zone, uid) must only ever touch the queued
    // entry's own author's row.
    const own = {
      id: "checkin-1",
      zoneId: "zone-1",
      userId: "user-1",
      status: "safe" as const,
      checkedInAt: new Date(Date.now() - 60_000).toISOString(),
    };
    const neighbour = {
      id: "checkin-2",
      zoneId: "zone-1",
      userId: "user-2",
      status: "needs_help" as const,
      checkedInAt: new Date(Date.now() - 30_000).toISOString(),
    };
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "needs_help" });

    const merged = mergeCheckIns([own, neighbour], [entry], "user-1");

    expect(merged).toHaveLength(2);
    // The neighbour's row survives untouched — an operator reading this
    // zone's headcount must still see them.
    expect(merged).toContainEqual(neighbour);
    // The caller's own stale row was replaced by their queued answer, not
    // left as a duplicate.
    expect(merged.find((c) => c.id === entry.id)?.status).toBe("needs_help");
    expect(merged.some((c) => c.id === "checkin-1")).toBe(false);
  });

  it("appends a queued check-in without displacing anyone when this device has no session yet", () => {
    // A resident with no session has no server row of their own — there is
    // nothing to replace, so the queued entry must be appended, not swap out
    // someone else's row for this zone.
    const someoneElse = {
      id: "checkin-1",
      zoneId: "zone-1",
      userId: "user-1",
      status: "safe" as const,
      checkedInAt: new Date().toISOString(),
    };
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "needs_help" });

    const merged = mergeCheckIns([someoneElse], [entry], null);

    expect(merged).toHaveLength(2);
    expect(merged).toContainEqual(someoneElse);
    expect(merged.find((c) => c.id === entry.id)?.status).toBe("needs_help");
  });

  it("ignores an entry belonging to another store", () => {
    const entry = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });

    expect(mergeCheckIns([], [entry], "user-1")).toHaveLength(0);
  });

  it("keeps a server row for a different zone untouched by a queued check-in", () => {
    const zone2 = {
      id: "checkin-2",
      zoneId: "zone-2",
      userId: "user-1",
      status: "safe" as const,
      checkedInAt: new Date().toISOString(),
    };
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "needs_help" });

    const merged = mergeCheckIns([zone2], [entry], "user-1");

    expect(merged).toHaveLength(2);
    expect(merged.find((c) => c.zoneId === "zone-2")).toEqual(zone2);
  });

  it("drops a permanently-failed check-in instead of showing it as answered", () => {
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "needs_help" });
    const failed = { ...entry, permanentlyFailed: true };

    expect(mergeCheckIns([], [failed], "user-1")).toHaveLength(0);
  });

  it("lets the later of two queued check-ins for the same zone win", () => {
    // A resident who tapped "safe" and then "needs help" before either
    // reached the server has two entries queued for one zone; the second is
    // what they actually meant.
    enqueue("recordCheckIn", { zoneId: "zone-1", status: "safe" });
    const second = enqueue("recordCheckIn", { zoneId: "zone-1", status: "needs_help" });
    void second;

    const merged = mergeCheckIns([], readOutbox(), "user-1");

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("needs_help");
  });
});

describe("getCheckInsForZone", () => {
  it("filters check-ins by zone", () => {
    const checkIns: EvacuationCheckIn[] = [
      { id: "c1", zoneId: "zone-1", userId: "user-1", status: "safe", checkedInAt: new Date().toISOString() },
      { id: "c2", zoneId: "zone-2", userId: "user-2", status: "needs_help", checkedInAt: new Date().toISOString() },
    ];

    const zone1 = getCheckInsForZone(checkIns, "zone-1");

    expect(zone1).toHaveLength(1);
    expect(zone1[0].zoneId).toBe("zone-1");
  });
});

describe("getOwnCheckInForZone", () => {
  it("finds this resident's own server row by uid", () => {
    const checkIns: EvacuationCheckIn[] = [
      { id: "c1", zoneId: "zone-1", userId: "user-1", status: "needs_help", checkedInAt: new Date().toISOString() },
    ];

    expect(getOwnCheckInForZone(checkIns, "zone-1", "user-1")?.status).toBe("needs_help");
  });

  it("returns undefined when this resident has not checked in for a zone", () => {
    expect(getOwnCheckInForZone([], "zone-1", "user-1")).toBeUndefined();
  });

  it("does not claim a neighbour's check-in for this resident", () => {
    // An operator's zone-wide view can carry other residents' rows; a
    // resident reading their own must never mistake one of those for theirs.
    const checkIns: EvacuationCheckIn[] = [
      { id: "c1", zoneId: "zone-1", userId: "user-2", status: "safe", checkedInAt: new Date().toISOString() },
    ];

    expect(getOwnCheckInForZone(checkIns, "zone-1", "user-1")).toBeUndefined();
  });

  it("claims a check-in still in the outbox even though it has no userId yet", () => {
    // Attribution happens at replay, so a queued check-in carries no uid —
    // but the outbox only ever holds writes made on this device.
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "safe" });
    const merged = mergeCheckIns([], [entry], null);

    expect(getOwnCheckInForZone(merged, "zone-1", null)?.status).toBe("safe");
  });
});

describe("recordCheckIn", () => {
  it("queues a check-in with the outbox's own id, which becomes the row's primary key", () => {
    recordCheckIn("zone-1", "safe");

    const [entry] = readOutbox();
    expect(entry.operation).toBe("recordCheckIn");
    expect(entry.payload).toEqual({ zoneId: "zone-1", status: "safe" });
    expect(ensureAnonymousSession).toHaveBeenCalled();
  });

  it("leaves both writes queued, converging on the second through the merge", () => {
    // Unlike community-pins' voteOnPin, recordCheckIn does not guard against
    // a second call for the same zone — each is a distinct, legitimate
    // change of answer, and the upsert on the server (and mergeCheckIns'
    // zone-keyed replacement here) is what makes replaying both converge on
    // the resident's actual last answer rather than requiring dedup at
    // enqueue time.
    recordCheckIn("zone-1", "safe");
    recordCheckIn("zone-1", "needs_help");

    expect(readOutbox()).toHaveLength(2);
    const merged = mergeCheckIns([], readOutbox(), "user-1");
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("needs_help");
  });
});
