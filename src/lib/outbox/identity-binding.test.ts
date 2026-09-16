import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

/**
 * I2: a queued write belongs to the identity that queued it.
 *
 * The session is faked at the Supabase client, not at anonymous-session.ts:
 * the real ensureAnonymousSession runs, so "never signs anyone in" is proved
 * against signInAnonymously itself rather than against a mock of its caller.
 *
 * The drain itself is real, all the way down to dispatchQueued — only the
 * wire is stubbed: `fetch`, since every operation now sends through
 * `/api/outbox/<operation>` (Task 4) rather than through a dynamically
 * imported Server Action.
 */
const getSession = vi.fn();
const signInAnonymously = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ auth: { getSession, signInAnonymously } }),
}));

import { useOutboxDrain } from "./use-outbox-drain";
import { enqueue, readOutbox, visibleToCurrentUser } from "./outbox";
import { rememberSessionUserId } from "@/lib/auth/session-user";
import type { OutboxEntry } from "./types";

function sessionFor(id: string | null, isAnonymous = false) {
  getSession.mockResolvedValue({
    data: { session: id ? { user: { id, is_anonymous: isAnonymous } } : null },
    error: null,
  });
}

/** Writes entries straight to storage, as an earlier page load would have. */
function seed(entries: Array<Partial<OutboxEntry> & { id: string }>) {
  localStorage.setItem(
    "weatherwell.outbox",
    JSON.stringify(
      entries.map((entry) => ({
        operation: "submitWaterLevelReport",
        payload: { zoneId: "zone-1", depthLevel: "knee" },
        queuedAt: "2026-09-15T00:00:00.000Z",
        attempts: 0,
        status: "pending",
        nextAttemptAt: null,
        updatedAt: "2026-09-15T00:00:00.000Z",
        ...entry,
      }))
    )
  );
}

/** The outbox entry ids `fetch` was actually POSTed for, in call order. */
function sentIds(): string[] {
  return fetchMock.mock.calls.map(([, init]) => (JSON.parse((init as RequestInit).body as string) as { id: string }).id);
}

/** Lets the drain's promise chain (session lookup, fetch, dispatch) run out. */
async function settle() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("outbox identity binding (I2)", () => {
  beforeEach(() => {
    localStorage.clear();
    getSession.mockReset();
    signInAnonymously.mockReset();
    signInAnonymously.mockResolvedValue({ data: { user: { id: "new-anonymous" } }, error: null });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ status: 200, json: () => Promise.resolve({ result: "delivered" }) });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("stamps a new entry with the user id of the session that queued it", async () => {
    sessionFor("official-a");
    renderHook(() => useOutboxDrain());
    await vi.waitFor(() => expect(getSession).toHaveBeenCalled());
    await settle();

    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    expect(entry.userId).toBe("official-a");
    expect(readOutbox()[0].userId).toBe("official-a");
  });

  it("holds another user's entry: not replayed, not deleted, not marked failed", async () => {
    // Person A queued it; person B is signed in on the same phone now.
    seed([{ id: "from-a", userId: "user-a" }]);
    sessionFor("user-b");

    renderHook(() => useOutboxDrain());
    await vi.waitFor(() => expect(getSession).toHaveBeenCalled());
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readOutbox()).toHaveLength(1);
    expect(readOutbox()[0]).toMatchObject({ id: "from-a", userId: "user-a", attempts: 0, status: "pending" });
  });

  it("never signs in anonymously just to send a signed-out user's entry", async () => {
    // After sign-out there is no session. Before this fix the drain called
    // ensureAnonymousSession, created a stranger identity, and replayed the
    // official's writes under it.
    seed([{ id: "from-official", userId: "official-a" }]);
    sessionFor(null);

    renderHook(() => useOutboxDrain());
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readOutbox()).toHaveLength(1);
  });

  it("still sends a resident's queued writes after they link Google, which keeps the same user id", async () => {
    // Queued while anonymous; linkIdentity keeps the uid, so the session is
    // now permanent but the id matches.
    seed([{ id: "from-resident", userId: "resident-r" }]);
    sessionFor("resident-r", false);

    renderHook(() => useOutboxDrain());

    await vi.waitFor(() => expect(readOutbox()).toHaveLength(0));
    expect(sentIds()).toContain("from-resident");
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("holds a legacy entry that recorded no author, even with a session present", async () => {
    // Queued before entries carried an author: nothing says whose it is.
    seed([{ id: "legacy" }]);
    sessionFor("user-b");

    renderHook(() => useOutboxDrain());
    await vi.waitFor(() => expect(getSession).toHaveBeenCalled());
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(readOutbox()).toHaveLength(1);
  });

  it("returns this session's own held entries to pending and sends them, once its owner is signed in again", async () => {
    // A 409 from an earlier drain (a different person's session at the time)
    // set this to held. Now the same user is signed in on this device again
    // — design doc, "Held entries": "When a drain runs as the entry's owner
    // again, held entries owned by that user return to pending." There is
    // nothing left to wait for, so the same drain sends it.
    seed([{ id: "was-held", userId: "user-1", status: "held" }]);
    sessionFor("user-1");

    renderHook(() => useOutboxDrain());

    await vi.waitFor(() => expect(readOutbox()).toHaveLength(0));
    expect(sentIds()).toContain("was-held");
  });

  it("leaves another user's held entry alone even while draining this session's own writes", async () => {
    // The shared-phone seam this closes must stay closed from both sides:
    // signing back in as the entry's rightful owner unholds it (above), but
    // signing in as anyone ELSE must not.
    seed([{ id: "held-for-a", userId: "user-a", status: "held" }]);
    sessionFor("user-b");

    renderHook(() => useOutboxDrain());
    await vi.waitFor(() => expect(getSession).toHaveBeenCalled());
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readOutbox()[0]).toMatchObject({ id: "held-for-a", userId: "user-a", status: "held" });
  });

  it("signs a first-time resident in for a write queued with no identity, sending only that write", async () => {
    // The original first-write rule still holds: a write made before any
    // identity existed is attributed to the one it receives. Another user's
    // held entry does not ride along.
    seed([
      { id: "from-a", userId: "user-a" },
      { id: "no-identity-yet", userId: null },
    ]);
    sessionFor(null);

    renderHook(() => useOutboxDrain());

    await vi.waitFor(() => expect(sentIds()).toContain("no-identity-yet"));
    await settle();
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readOutbox().map((entry) => entry.id)).toEqual(["from-a"]);
  });
});

describe("M13: a held entry from a different person on a shared phone stays invisible to this one", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ status: 200, json: () => Promise.resolve({ result: "delivered" }) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    // Module-level state in session-user.ts — reset so this test's identity
    // does not leak into a later test file's first read of it.
    rememberSessionUserId(null);
  });

  it("excludes another user's entry, but includes this device's own and any unowned entry", () => {
    rememberSessionUserId("user-b");

    const base: OutboxEntry = {
      id: "x",
      operation: "submitWaterLevelReport",
      payload: { zoneId: "zone-1", depthLevel: "knee" },
      queuedAt: "2026-09-15T00:00:00.000Z",
      attempts: 0,
      status: "pending",
      nextAttemptAt: null,
      updatedAt: "2026-09-15T00:00:00.000Z",
    };

    // Person A queued this, then held it (a 409) before person B is now
    // signed in on the same phone — the shared-phone seam this closes.
    const heldFromA: OutboxEntry = { ...base, id: "from-a", userId: "user-a", status: "held" };
    // This device's own current session.
    const ownEntry: OutboxEntry = { ...base, id: "from-b", userId: "user-b" };
    // Queued before any identity existed on this device.
    const unowned: OutboxEntry = { ...base, id: "no-identity-yet", userId: null };

    expect(visibleToCurrentUser(heldFromA)).toBe(false);
    expect(visibleToCurrentUser(ownEntry)).toBe(true);
    expect(visibleToCurrentUser(unowned)).toBe(true);
  });

  it("is what keeps a held entry out of the current person's optimistic merge", () => {
    // The concrete failure M13 names: without this filter, `readOutbox()`
    // returns every entry regardless of owner (drainForCurrentSession only
    // decides what to SEND, not what a merge may DRAW), so a merge that read
    // the raw queue would show person A's held pin/report as person B's own
    // just-made write.
    rememberSessionUserId("user-b");
    seed([{ id: "from-a", userId: "user-a", status: "held" }]);

    const visible = readOutbox().filter(visibleToCurrentUser);

    expect(visible).toHaveLength(0);
  });
});
