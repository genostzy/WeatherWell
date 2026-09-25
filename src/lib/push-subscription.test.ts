import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Saved through save_push_subscription, which hands the phone's address to whoever uses it now.
const rpc = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ rpc }),
}));

const ensureAnonymousSession = vi.fn();
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: () => ensureAnonymousSession(),
}));

import { usePushSubscription } from "./push-subscription";

const fakeSubscription = {
  endpoint: "https://push.example/1",
  toJSON: () => ({ endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn(async () => true),
};
const pushManager = { subscribe: vi.fn(), getSubscription: vi.fn() };
const requestPermission = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  pushManager.subscribe.mockResolvedValue(fakeSubscription);
  pushManager.getSubscription.mockResolvedValue(null);
  requestPermission.mockResolvedValue("granted");
  rpc.mockResolvedValue({ error: null });
  ensureAnonymousSession.mockResolvedValue("user-1");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AAAA");
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", { permission: "default", requestPermission });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("usePushSubscription", () => {
  it("does nothing without a barangay, so no subscription can receive every barangay's alerts", async () => {
    const { result } = renderHook(() => usePushSubscription(undefined));

    await act(() => result.current.subscribe());

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("signs in anonymously if needed and saves the subscription under its barangay", async () => {
    const { result } = renderHook(() => usePushSubscription("zone-1"));

    await act(() => result.current.subscribe());

    expect(ensureAnonymousSession).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "save_push_subscription",
      expect.objectContaining({ p_zone_id: "zone-1", p_endpoint: "https://push.example/1", p_p256dh: "p", p_auth: "a" })
    );
    expect(result.current.state.subscription).toBe(fakeSubscription);
  });

  it("does not report subscribed when there is no session to save it under (offline)", async () => {
    ensureAnonymousSession.mockResolvedValue(null);
    const { result } = renderHook(() => usePushSubscription("zone-1"));

    await act(() => result.current.subscribe());

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.state.subscription).toBeNull();
  });

  it("does not report subscribed when saving fails, and undoes the browser subscription", async () => {
    rpc.mockResolvedValue({ error: { message: "permission denied" } });
    const { result } = renderHook(() => usePushSubscription("zone-1"));

    await act(() => result.current.subscribe());

    expect(result.current.state.subscription).toBeNull();
    // Otherwise the next page load finds the browser subscription and shows
    // "subscribed" although no row exists, so no push would ever arrive.
    expect(fakeSubscription.unsubscribe).toHaveBeenCalled();
  });

  it("says why it did not subscribe, so the button never just stops (found testing push on a phone)", async () => {
    const noZone = renderHook(() => usePushSubscription(undefined));
    expect(await act(() => noZone.result.current.subscribe())).toBe("no-zone");

    ensureAnonymousSession.mockResolvedValueOnce(null);
    const offline = renderHook(() => usePushSubscription("zone-1"));
    expect(await act(() => offline.result.current.subscribe())).toBe("no-session");

    requestPermission.mockResolvedValueOnce("denied");
    const denied = renderHook(() => usePushSubscription("zone-1"));
    expect(await act(() => denied.result.current.subscribe())).toBe("denied");

    rpc.mockResolvedValueOnce({ error: { message: "x" } });
    const unsaved = renderHook(() => usePushSubscription("zone-1"));
    expect(await act(() => unsaved.result.current.subscribe())).toBe("failed");

    pushManager.subscribe.mockRejectedValueOnce(new Error("push service unavailable"));
    const thrown = renderHook(() => usePushSubscription("zone-1"));
    expect(await act(() => thrown.result.current.subscribe())).toBe("failed");

    const ok = renderHook(() => usePushSubscription("zone-1"));
    expect(await act(() => ok.result.current.subscribe())).toBe("subscribed");
  });

  it("re-saves an existing browser subscription on load, under the current barangay and account", async () => {
    // Heals devices whose earlier save failed or never happened (0 rows
    // existed before this fix), follows a change of barangay, and (privacy
    // review) hands the address to whoever uses the phone now.
    pushManager.getSubscription.mockResolvedValue(fakeSubscription);

    const { result } = renderHook(() => usePushSubscription("zone-2"));

    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "save_push_subscription",
        expect.objectContaining({ p_zone_id: "zone-2", p_endpoint: "https://push.example/1" })
      )
    );
    expect(result.current.state.subscription).toBe(fakeSubscription);
  });
});
