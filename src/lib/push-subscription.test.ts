import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const upsert = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ from: () => ({ upsert }) }),
}));

const ensureAnonymousSession = vi.fn();
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: () => ensureAnonymousSession(),
}));

import { usePushSubscription } from "./push-subscription";

const fakeSubscription = {
  endpoint: "https://push.example/1",
  toJSON: () => ({ endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } }),
};
const pushManager = { subscribe: vi.fn(), getSubscription: vi.fn() };
const requestPermission = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  pushManager.subscribe.mockResolvedValue(fakeSubscription);
  pushManager.getSubscription.mockResolvedValue(null);
  requestPermission.mockResolvedValue("granted");
  upsert.mockResolvedValue({ error: null });
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
    expect(upsert).not.toHaveBeenCalled();
  });

  it("signs in anonymously if needed and saves the subscription under its barangay", async () => {
    const { result } = renderHook(() => usePushSubscription("zone-1"));

    await act(() => result.current.subscribe());

    expect(ensureAnonymousSession).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", zone_id: "zone-1", endpoint: "https://push.example/1" }),
      { onConflict: "user_id,endpoint" }
    );
    expect(result.current.state.subscription).toBe(fakeSubscription);
  });

  it("does not report subscribed when there is no session to save it under (offline)", async () => {
    ensureAnonymousSession.mockResolvedValue(null);
    const { result } = renderHook(() => usePushSubscription("zone-1"));

    await act(() => result.current.subscribe());

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(result.current.state.subscription).toBeNull();
  });

  it("does not report subscribed when saving fails", async () => {
    upsert.mockResolvedValue({ error: { message: "permission denied" } });
    const { result } = renderHook(() => usePushSubscription("zone-1"));

    await act(() => result.current.subscribe());

    expect(result.current.state.subscription).toBeNull();
  });
});
