import { describe, it, expect, beforeEach, vi } from "vitest";

// community-pins.ts calls ensureAnonymousSession from triggerDrain, which
// reaches getBrowserClient and therefore readSupabaseEnv — vitest does not
// load .env.local, so the real module throws. Every test here is about the
// merge and the queue, not about signing in, so both exports are stubbed.
const ensureAnonymousSession = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: () => ensureAnonymousSession(),
  useSessionUserId: () => null,
}));

import { enqueue, markFailed, readOutbox } from "@/lib/outbox/outbox";
import { exceedsRemovalThreshold } from "@/lib/community-pin";
import {
  mergePins,
  isOwnPin,
  addCommunityPin,
  updateCommunityPin,
  deleteOwnPin,
  removePinByAdmin,
  restoreCommunityPin,
  voteOnPin,
  hasVotedOnPin,
  PENDING_AUTHOR_ID,
  type CommunityPin,
} from "./community-pins";

beforeEach(() => {
  localStorage.clear();
  ensureAnonymousSession.mockClear();
});

const serverPin = (id: string, over: Partial<CommunityPin> = {}): CommunityPin => ({
  id,
  zoneId: "zone-1",
  statusTag: "flooded",
  caption: "Knee-deep by the market",
  lat: 16.06,
  lng: 120.4,
  upvotes: 0,
  downvotes: 0,
  ownVote: undefined,
  createdAt: new Date().toISOString(),
  authorId: "user-1",
  removed: false,
  ...over,
});

describe("mergePins", () => {
  it("shows a queued pin immediately, before it has reached the server", () => {
    // A resident marking an impassable road during a flood must see it land
    // at once. Waiting on a round trip they may never complete is how the
    // app feels broken exactly when it matters.
    const entry = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "impassable",
      caption: "Bridge is under water",
      lat: 16.04,
      lng: 120.48,
    });

    const merged = mergePins([], [entry]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(entry.id);
    expect(merged[0].caption).toBe("Bridge is under water");
  });

  it("lets the server row replace the queued pin, rather than the other way round", () => {
    // One row, and it must be the SERVER's. The optimistic pin knows no author
    // and no tallies; overwriting a confirmed row with it would take the
    // resident's own Edit/Delete buttons away and reset every vote the pin has
    // collected to zero.
    const entry = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });

    const merged = mergePins([serverPin(entry.id, { upvotes: 3 })], [entry]);

    expect(merged).toHaveLength(1);
    expect(merged[0].authorId).toBe("user-1");
    expect(merged[0].upvotes).toBe(3);
  });

  it("renders one row when an id is queued twice", () => {
    // Two rows for one pin is not a cosmetic duplicate: the map draws two
    // markers on one spot and the zone's pin count says two people reported
    // it when one did.
    const entry = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });

    expect(mergePins([], [entry, entry])).toHaveLength(1);
  });

  it("drops a permanently failed pin instead of showing it as posted", () => {
    const entry = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });
    markFailed(entry.id, "denied", true);

    const queued = JSON.parse(localStorage.getItem("weatherwell.outbox") ?? "[]");

    expect(mergePins([], queued)).toHaveLength(0);
  });

  it("ignores an entry belonging to another store", () => {
    // Six operations share one queue. A merge that filters on nothing would
    // render a water-level report as a map pin.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    expect(mergePins([], [entry])).toHaveLength(0);
  });

  it("applies a queued edit to the server row it edits", () => {
    // The resident retyped the caption offline. Showing the old one back to
    // them reads as the edit having failed.
    const pin = serverPin("pin-1", { caption: "Old wording" });
    const entry = enqueue("editPin", {
      pinId: "pin-1",
      statusTag: "receding",
      caption: "New wording",
    });

    const [merged] = mergePins([pin], [entry]);

    expect(merged.caption).toBe("New wording");
    expect(merged.statusTag).toBe("receding");
  });

  it("hides a pin the resident deleted while offline", () => {
    const pin = serverPin("pin-1");
    const entry = enqueue("deleteOwnPin", { pinId: "pin-1" });

    expect(mergePins([pin], [entry])).toHaveLength(0);
  });

  it("shows an operator's queued removal as removed, with its reason", () => {
    // An operator on a bad connection is still an operator: the removal is
    // queued like any other write, and the panel that issued it must show the
    // pin in its removed section immediately rather than looking like the
    // click did nothing.
    const pin = serverPin("pin-1");
    const entry = enqueue("setPinRemoved", { pinId: "pin-1", removed: true, reason: "admin" });

    const [merged] = mergePins([pin], [entry]);

    expect(merged.removed).toBe(true);
    expect(merged.removedReason).toBe("admin");
  });

  it("shows a queued restore as active again, with no reason left behind", () => {
    const pin = serverPin("pin-1", { removed: true, removedReason: "net_score" });
    const entry = enqueue("setPinRemoved", { pinId: "pin-1", removed: false, reason: "admin" });

    const [merged] = mergePins([pin], [entry]);

    expect(merged.removed).toBe(false);
    expect(merged.removedReason).toBeUndefined();
  });

  it("counts a queued vote on the pin it names, and only that pin", () => {
    // Votes are the anti-abuse corroboration signal. A resident who taps
    // upvote and sees the count unchanged taps again, which is how one
    // opinion becomes two queued writes.
    const entry = enqueue("voteOnPin", { pinId: "pin-1", direction: 1 });

    const merged = mergePins([serverPin("pin-1"), serverPin("pin-2")], [entry]);

    expect(merged.find((pin) => pin.id === "pin-1")).toMatchObject({ upvotes: 1, ownVote: 1 });
    expect(merged.find((pin) => pin.id === "pin-2")).toMatchObject({ upvotes: 0, ownVote: undefined });
  });

  it("applies queued writes in the order they were queued", () => {
    // Edit, then edit again. The second is what the resident last typed.
    const pin = serverPin("pin-1", { caption: "First" });
    const a = enqueue("editPin", { pinId: "pin-1", statusTag: "rising", caption: "Second" });
    const b = enqueue("editPin", { pinId: "pin-1", statusTag: "receding", caption: "Third" });

    const [merged] = mergePins([pin], [a, b]);

    expect(merged.caption).toBe("Third");
  });
});

describe("isOwnPin", () => {
  it("claims a pin still in this device's outbox even though it has no author id yet", () => {
    // Attribution happens at replay, so a queued pin carries no uid — but the
    // outbox only ever holds writes made on this device. Reporting it as
    // someone else's would take Edit and Delete away from the resident for
    // the whole time their own pin sits unsent.
    const queued = mergePins([], [
      enqueue("createPin", {
        zoneId: "zone-1",
        statusTag: "flooded",
        caption: "Mine",
        lat: 16.06,
        lng: 120.4,
      }),
    ])[0];

    expect(queued.authorId).toBe(PENDING_AUTHOR_ID);
    expect(isOwnPin(queued, null)).toBe(true);
  });

  it("does not claim a neighbour's pin for a resident with no session", () => {
    expect(isOwnPin(serverPin("pin-1", { authorId: "user-2" }), null)).toBe(false);
  });

  it("matches a server row against the signed-in resident's uid", () => {
    expect(isOwnPin(serverPin("pin-1", { authorId: "user-1" }), "user-1")).toBe(true);
    expect(isOwnPin(serverPin("pin-1", { authorId: "user-2" }), "user-1")).toBe(false);
  });
});

describe("queued writes", () => {
  it("queues a create with the outbox's own id, which becomes the row's primary key", () => {
    addCommunityPin({
      zoneId: "zone-2",
      statusTag: "rising",
      caption: "Water at the gate",
      lat: 16.07,
      lng: 120.4,
    });

    const [entry] = readOutbox();
    expect(entry.operation).toBe("createPin");
    expect(entry.payload).toEqual({
      zoneId: "zone-2",
      statusTag: "rising",
      caption: "Water at the gate",
      lat: 16.07,
      lng: 120.4,
    });
    expect(ensureAnonymousSession).toHaveBeenCalled();
  });

  it("queues an edit, a delete, a removal and a restore rather than writing locally", () => {
    updateCommunityPin("pin-1", { statusTag: "receding", caption: "Going down" });
    deleteOwnPin("pin-2");
    removePinByAdmin("pin-3");
    restoreCommunityPin("pin-4");

    expect(readOutbox().map((entry) => entry.operation)).toEqual([
      "editPin",
      "deleteOwnPin",
      "setPinRemoved",
      "setPinRemoved",
    ]);
    expect(readOutbox()[2].payload).toEqual({ pinId: "pin-3", removed: true, reason: "admin" });
    expect(readOutbox()[3].payload).toEqual({ pinId: "pin-4", removed: false, reason: "admin" });
  });

  it("does not queue a second vote for a pin this device has already voted on", () => {
    // One vote per resident per pin — PRD anti-abuse layer 10. A second
    // queued vote would be a duplicate write the server refuses, and the
    // outbox would carry it forever.
    voteOnPin("pin-1", 1);
    voteOnPin("pin-1", -1);

    expect(readOutbox()).toHaveLength(1);
  });

  it("reports a pin as voted on once the vote is queued, not only once it lands", () => {
    voteOnPin("pin-1", 1);
    const [merged] = mergePins([serverPin("pin-1")], readOutbox());

    expect(hasVotedOnPin(merged)).toBe(true);
    expect(hasVotedOnPin(serverPin("pin-2"))).toBe(false);
  });

  it("does not queue a second vote once the first permanently failed", () => {
    // Ruling 3: dispatchQueuedVote can now raise PermanentFailure (the
    // placeholder it replaced never could), and a permanently-failed entry
    // will never be delivered — drainOutbox skips it forever. Without this
    // exclusion, that dead entry would satisfy the "already queued" guard
    // above forever, locking the resident out of ever voting on this pin
    // again.
    voteOnPin("pin-1", 1);
    markFailed(readOutbox()[0].id, "rejected", true);

    voteOnPin("pin-1", -1);

    const ops = readOutbox().map((entry) => entry.operation);
    expect(ops).toEqual(["voteOnPin", "voteOnPin"]);
  });
});

describe("net-score removal", () => {
  it("removes a pin once downvotes exceed upvotes by the threshold", () => {
    // PRD Anti-Abuse layer 10. A well-corroborated pin is not killed by a
    // handful of bad-faith downvotes, so the test is on the MARGIN, not on
    // the downvote count.
    expect(exceedsRemovalThreshold({ upvotes: 0, downvotes: 5 })).toBe(true);
    expect(exceedsRemovalThreshold({ upvotes: 4, downvotes: 8 })).toBe(false);
  });
});

describe("hasVotedOnPin", () => {
  it("reads the caller's own vote off the pin", () => {
    expect(hasVotedOnPin(serverPin("pin-1", { ownVote: 1 }))).toBe(true);
    expect(hasVotedOnPin(serverPin("pin-1"))).toBe(false);
  });
});

describe("mergePins with a queued vote", () => {
  it("shows the resident their own queued vote immediately", () => {
    // Without this the button springs back to un-voted the instant they tap
    // it, and they tap again.
    const pin = serverPin("pin-1", { upvotes: 2 });
    const entry = enqueue("voteOnPin", { pinId: "pin-1", direction: 1 });

    const [merged] = mergePins([pin], [entry]);

    expect(merged.ownVote).toBe(1);
    expect(merged.upvotes).toBe(3);
  });

  it("does not double-count a queued vote the server already recorded", () => {
    const pin = serverPin("pin-1", { upvotes: 3, ownVote: 1 });
    const entry = enqueue("voteOnPin", { pinId: "pin-1", direction: 1 });

    const [merged] = mergePins([pin], [entry]);

    expect(merged.upvotes).toBe(3);
  });
});
