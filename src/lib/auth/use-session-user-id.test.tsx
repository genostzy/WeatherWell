import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

/**
 * useSessionUserId decides whose queued writes a screen shows. After an hour
 * offline the access token has expired and cannot be refreshed, and
 * supabase-js answers "no session" with a retryable error. Treating that as
 * signed out hides a resident's own unsent reports, which invites them to
 * file the same report again. Only a real sign-out, or a genuinely absent
 * session, clears the id. Display only: the server checks ownership on every
 * send regardless.
 */
const getSession = vi.fn();
type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;
let authCallback: AuthCallback | null = null;
const unsubscribe = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    auth: {
      getSession,
      onAuthStateChange: (cb: AuthCallback) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  }),
}));

import { useSessionUserId, LAST_SESSION_USER_KEY } from "./anonymous-session";

const retryable = Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError", status: 0 });

beforeEach(() => {
  localStorage.clear();
  getSession.mockReset();
  unsubscribe.mockReset();
  authCallback = null;
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("useSessionUserId", () => {
  it("returns the session's user and remembers it on this device", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-a" } } }, error: null });
    const { result } = renderHook(() => useSessionUserId());
    await waitFor(() => expect(result.current).toBe("user-a"));
    expect(localStorage.getItem(LAST_SESSION_USER_KEY)).toBe("user-a");
  });

  it("starts from the remembered user, so a fresh page does not briefly hide the resident's own queued writes", () => {
    localStorage.setItem(LAST_SESSION_USER_KEY, "user-a");
    getSession.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSessionUserId());
    expect(result.current).toBe("user-a");
  });

  it("keeps the remembered user when the session cannot be refreshed (offline for more than an hour)", async () => {
    localStorage.setItem(LAST_SESSION_USER_KEY, "user-a");
    getSession.mockResolvedValue({ data: { session: null }, error: retryable });
    const { result } = renderHook(() => useSessionUserId());
    await act(async () => {});
    expect(result.current).toBe("user-a");
    expect(localStorage.getItem(LAST_SESSION_USER_KEY)).toBe("user-a");
  });

  it("keeps the remembered user while the device is offline, even if no error is reported", async () => {
    localStorage.setItem(LAST_SESSION_USER_KEY, "user-a");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { result } = renderHook(() => useSessionUserId());
    await act(async () => {});
    expect(result.current).toBe("user-a");
  });

  it("clears the user when there is genuinely no session online and no error (storage cleared)", async () => {
    localStorage.setItem(LAST_SESSION_USER_KEY, "user-a");
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { result } = renderHook(() => useSessionUserId());
    await waitFor(() => expect(result.current).toBeNull());
    expect(localStorage.getItem(LAST_SESSION_USER_KEY)).toBeNull();
  });

  it("clears the user on a real sign-out, so a shared phone stops showing the previous person's items", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-a" } } }, error: null });
    const { result } = renderHook(() => useSessionUserId());
    await waitFor(() => expect(result.current).toBe("user-a"));
    act(() => authCallback!("SIGNED_OUT", null));
    expect(result.current).toBeNull();
    expect(localStorage.getItem(LAST_SESSION_USER_KEY)).toBeNull();
  });

  it("ignores a session-less auth event that is not a sign-out", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-a" } } }, error: null });
    const { result } = renderHook(() => useSessionUserId());
    await waitFor(() => expect(result.current).toBe("user-a"));
    act(() => authCallback!("TOKEN_REFRESHED", null));
    expect(result.current).toBe("user-a");
  });

  it("follows a switch to a different account immediately", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-a" } } }, error: null });
    const { result } = renderHook(() => useSessionUserId());
    await waitFor(() => expect(result.current).toBe("user-a"));
    act(() => authCallback!("SIGNED_IN", { user: { id: "user-b" } }));
    expect(result.current).toBe("user-b");
    expect(localStorage.getItem(LAST_SESSION_USER_KEY)).toBe("user-b");
  });

  it("stops listening on unmount", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { unmount } = renderHook(() => useSessionUserId());
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
