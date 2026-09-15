import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

/**
 * I2: a queued write belongs to the identity that queued it.
 *
 * The session is faked at the Supabase client, not at anonymous-session.ts:
 * the real ensureAnonymousSession runs, so "never signs anyone in" is proved
 * against signInAnonymously itself rather than against a mock of its caller.
 */
const getSession = vi.fn();
const signInAnonymously = vi.fn();
const dispatchQueuedReport = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ auth: { getSession, signInAnonymously } }),
}));

// The real dispatcher dynamically imports the Server Action, which pulls in
// `server-only`. The drain itself is real — only the wire is stubbed.
vi.mock("@/lib/water-level-reports", () => ({
  dispatchQueuedReport: (...args: unknown[]) => dispatchQueuedReport(...args),
}));

import { useOutboxDrain } from "./use-outbox-drain";
import { enqueue, readOutbox } from "./outbox";
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
        permanentlyFailed: false,
        ...entry,
      }))
    )
  );
}

/** Lets the drain's promise chain (session lookup, dynamic import, dispatch) run out. */
async function settle() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("outbox identity binding (I2)", () => {
  beforeEach(() => {
    localStorage.clear();
    getSession.mockReset();
    signInAnonymously.mockReset();
    signInAnonymously.mockResolvedValue({ data: { user: { id: "new-anonymous" } }, error: null });
    dispatchQueuedReport.mockReset();
    dispatchQueuedReport.mockResolvedValue(undefined);
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

    expect(dispatchQueuedReport).not.toHaveBeenCalled();
    expect(readOutbox()).toHaveLength(1);
    expect(readOutbox()[0]).toMatchObject({ id: "from-a", userId: "user-a", attempts: 0, permanentlyFailed: false });
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
    expect(dispatchQueuedReport).not.toHaveBeenCalled();
    expect(readOutbox()).toHaveLength(1);
  });

  it("still sends a resident's queued writes after they link Google, which keeps the same user id", async () => {
    // Queued while anonymous; linkIdentity keeps the uid, so the session is
    // now permanent but the id matches.
    seed([{ id: "from-resident", userId: "resident-r" }]);
    sessionFor("resident-r", false);

    renderHook(() => useOutboxDrain());

    await vi.waitFor(() => expect(readOutbox()).toHaveLength(0));
    expect(dispatchQueuedReport).toHaveBeenCalledWith(expect.objectContaining({ id: "from-resident" }));
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("holds a legacy entry that recorded no author, even with a session present", async () => {
    // Queued before entries carried an author: nothing says whose it is.
    seed([{ id: "legacy" }]);
    sessionFor("user-b");

    renderHook(() => useOutboxDrain());
    await vi.waitFor(() => expect(getSession).toHaveBeenCalled());
    await settle();

    expect(dispatchQueuedReport).not.toHaveBeenCalled();
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(readOutbox()).toHaveLength(1);
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

    await vi.waitFor(() =>
      expect(dispatchQueuedReport).toHaveBeenCalledWith(expect.objectContaining({ id: "no-identity-yet" }))
    );
    await settle();
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(dispatchQueuedReport).toHaveBeenCalledTimes(1);
    expect(readOutbox().map((entry) => entry.id)).toEqual(["from-a"]);
  });
});
