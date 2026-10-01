import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("@/lib/community-pins", () => ({
  addCommunityPin: vi.fn(),
  updateCommunityPin: vi.fn(),
  deleteOwnPin: vi.fn(),
}));

import { usePinFlow } from "./use-pin-flow";
import { MOCK_ZONES } from "@/lib/mock-data";

const zone = MOCK_ZONES[0];

describe("usePinFlow", () => {
  it("refuses a spot more than 15 km from every barangay, and keeps waiting for a closer tap", () => {
    const { result } = renderHook(() => usePinFlow(MOCK_ZONES));
    act(() => result.current.setIsPlacingPin(true));
    // About 30 km north of the northernmost fixture barangay.
    act(() => result.current.handleMapClickForPin(zone.lat + 0.6, zone.lng));
    expect(result.current.pendingPinLocation).toBeNull();
    expect(result.current.isPlacingPin).toBe(true);
    expect(result.current.pinTooFar).toBe(true);

    act(() => result.current.handleMapClickForPin(zone.lat + 0.01, zone.lng));
    expect(result.current.pendingPinLocation).toEqual({ lat: zone.lat + 0.01, lng: zone.lng });
    expect(result.current.pinTooFar).toBe(false);
  });
});
