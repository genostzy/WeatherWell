import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const signInAnonymously = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ auth: { getSession, signInAnonymously } }),
}));

import { ensureAnonymousSession } from "./anonymous-session";

beforeEach(() => {
  getSession.mockReset();
  signInAnonymously.mockReset();
});

describe("ensureAnonymousSession", () => {
  it("reuses an existing session rather than creating a second identity", async () => {
    // A resident who signs in twice becomes two people: their earlier reports
    // and pins stop being theirs.
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });

    await expect(ensureAnonymousSession()).resolves.toBe("user-1");
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });

    await expect(ensureAnonymousSession()).resolves.toBe("user-2");
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });

  it("returns null instead of throwing when sign-in fails", async () => {
    // Offline first-run. The app must still render and still queue writes —
    // attribution happens at replay, not here.
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({
      data: { user: null },
      error: { message: "network" },
    });

    await expect(ensureAnonymousSession()).resolves.toBeNull();
  });

  it("does not start two sign-ins when called concurrently", async () => {
    // Two callers on first paint would create two anonymous users and leave
    // one orphaned, along with whatever it was attributed.
    getSession.mockResolvedValue({ data: { session: null } });
    let resolveSignIn: (v: unknown) => void = () => {};
    signInAnonymously.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      })
    );

    const both = Promise.all([ensureAnonymousSession(), ensureAnonymousSession()]);
    resolveSignIn({ data: { user: { id: "user-3" } }, error: null });

    expect(await both).toEqual(["user-3", "user-3"]);
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });
});
