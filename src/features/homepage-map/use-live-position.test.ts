import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLivePosition } from "./use-live-position";

describe("useLivePosition", () => {
  beforeEach(() => {
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

  it("returns null when geolocation is unavailable", () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderHook(() => useLivePosition());
    expect(result.current).toBeNull();
  });
});
