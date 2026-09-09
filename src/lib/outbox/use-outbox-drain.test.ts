import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const ensureAnonymousSession = vi.fn();
const dispatchQueuedReport = vi.fn();

// Mocked so this file never touches the real Supabase browser client, and
// so we can assert on exactly when it is (and is not) called.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: (...args: unknown[]) => ensureAnonymousSession(...args),
}));

// The real dispatcher dynamically imports the Server Action, which pulls in
// `server-only`. The drain itself is real below — only the wire is stubbed.
vi.mock("@/lib/water-level-reports", () => ({
  dispatchQueuedReport: (...args: unknown[]) => dispatchQueuedReport(...args),
}));

import { useOutboxDrain } from "./use-outbox-drain";
import { enqueue, readOutbox } from "./outbox";

describe("useOutboxDrain", () => {
  beforeEach(() => {
    localStorage.clear();
    ensureAnonymousSession.mockReset();
    ensureAnonymousSession.mockResolvedValue(null);
    dispatchQueuedReport.mockReset();
    dispatchQueuedReport.mockResolvedValue(undefined);
  });

  it("does not sign anyone in when the outbox is empty", () => {
    // A visitor who only reads must never become a permanent row in
    // auth.users — sign-in happens on the first WRITE and nowhere else.
    renderHook(() => useOutboxDrain());
    expect(ensureAnonymousSession).not.toHaveBeenCalled();
  });

  it("signs in to attribute a queued report", () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    renderHook(() => useOutboxDrain());
    expect(ensureAnonymousSession).toHaveBeenCalled();
  });

  it("drains a queued report when the browser comes back online", async () => {
    // This listener is the mechanism the whole plan rests on: a report filed
    // with no signal reaches the barangay when signal returns, with no reload
    // and nobody tapping anything. It had only ever been proved by hand.
    ensureAnonymousSession.mockResolvedValue("user-1");
    renderHook(() => useOutboxDrain());

    // Mounted with an empty queue, so the mount run signed nobody in.
    expect(ensureAnonymousSession).not.toHaveBeenCalled();

    // Filed while offline, after mount.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    window.dispatchEvent(new Event("online"));

    await vi.waitFor(() => expect(readOutbox()).toHaveLength(0));
    expect(dispatchQueuedReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: entry.id })
    );
  });

  it("stops listening once unmounted", async () => {
    // The hook is mounted once per app load today, but a listener that
    // outlives its component drains on behalf of an unmounted tree.
    ensureAnonymousSession.mockResolvedValue("user-1");
    const { unmount } = renderHook(() => useOutboxDrain());
    unmount();

    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    window.dispatchEvent(new Event("online"));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ensureAnonymousSession).not.toHaveBeenCalled();
    expect(readOutbox()).toHaveLength(1);
  });
});
