import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLivePosition } from "./use-live-position";
import { markConsented } from "@/features/onboarding/onboarding-storage";

describe("useLivePosition", () => {
  beforeEach(() => {
    window.localStorage.clear();
    markConsented();
    vi.stubGlobal("navigator", {
      geolocation: {
        watchPosition: vi.fn((success) => {
          success({ coords: { latitude: 14.656, longitude: 121.1015 } });
          return 1;
        }),
        clearWatch: vi.fn(),
      },
    });
  });

  it("returns the watched position once geolocation reports one", async () => {
    const { result } = renderHook(() => useLivePosition());
    await waitFor(() => expect(result.current).toEqual({ lat: 14.656, lng: 121.1015 }));
  });

  it("never asks for the position before the resident accepts the current consent notice (privacy review)", () => {
    // /report opened from a link, before onboarding, used to prompt for location first.
    window.localStorage.clear();
    const { result } = renderHook(() => useLivePosition());
    expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("returns null when geolocation is unavailable", () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderHook(() => useLivePosition());
    expect(result.current).toBeNull();
  });
});
