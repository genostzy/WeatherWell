import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const ensureAnonymousSession = vi.fn();

// Mocked so this file never touches the real Supabase browser client, and
// so we can assert on exactly when it is (and is not) called.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: (...args: unknown[]) => ensureAnonymousSession(...args),
}));

import { useOutboxDrain } from "./use-outbox-drain";
import { enqueue } from "./outbox";

describe("useOutboxDrain", () => {
  beforeEach(() => {
    localStorage.clear();
    ensureAnonymousSession.mockReset();
    ensureAnonymousSession.mockResolvedValue(null);
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
});
