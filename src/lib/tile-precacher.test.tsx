import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { TilePrecacher } from "./tile-precacher";
import { setSelectedZoneId } from "@/features/onboarding/onboarding-storage";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const ZONE = FIXTURE_REFERENCE_DATA.zones[0];

function stubController() {
  const postMessage = vi.fn();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { controller: { postMessage } },
  });
  return postMessage;
}

describe("TilePrecacher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
  });

  it("waits before posting the precache message, so the live map's own tiles get a head start", () => {
    setSelectedZoneId(ZONE.id);
    const postMessage = stubController();

    renderWithData(<TilePrecacher />);
    expect(postMessage).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(postMessage).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "precache-tiles", lat: ZONE.lat, lng: ZONE.lng, radiusKm: 2 }),
      expect.any(Array)
    );
  });

  it("does nothing without a selected zone", () => {
    const postMessage = stubController();
    renderWithData(<TilePrecacher />);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does nothing without an active service worker controller", () => {
    setSelectedZoneId(ZONE.id);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });

    expect(() => {
      renderWithData(<TilePrecacher />);
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
    }).not.toThrow();
  });

  it("cancels the pending precache on unmount before it fires", () => {
    setSelectedZoneId(ZONE.id);
    const postMessage = stubController();
    const { unmount } = renderWithData(<TilePrecacher />);

    unmount();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(postMessage).not.toHaveBeenCalled();
  });
});
