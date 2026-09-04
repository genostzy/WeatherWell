import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRouteFinding } from "./use-route-finding";
import { MOCK_ZONES } from "@/lib/mock-data";
import { setZoneAlertOverride } from "@/lib/zone-overrides";
import { getZoneStatus } from "@/lib/zone-status";
import { resolveEffectiveAlert } from "@/lib/zone-overrides";

/**
 * The two "find safe" actions are the ones a resident reaches for when the
 * plan they had has stopped working, so what matters is that neither can name
 * somewhere the operator is currently evacuating.
 */
describe("useRouteFinding", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("never offers an evacuation center in a Dangerous or Hazardous zone", () => {
    // The shipped barangays sit kilometres apart, so no route trips the
    // proximity check and the route test alone says every zone is fine —
    // which previously meant zone-1 (Dangerous in mock data) was offered as
    // the "safe evacuation center".
    const { result } = renderHook(() => useRouteFinding(MOCK_ZONES));

    act(() => result.current.handleFindSafeEvacuationCenter());

    const chosen = result.current.routeZone;
    if (chosen) {
      const status = getZoneStatus(resolveEffectiveAlert(chosen.id, undefined));
      expect(["safe", "cautionary"]).toContain(status);
    } else {
      expect(result.current.notice).not.toBeNull();
    }
  });

  it("moves to another center once an operator escalates the one it offered", () => {
    const { result, rerender } = renderHook(() => useRouteFinding(MOCK_ZONES));

    // Clear zone-1 so there are two acceptable destinations, and the hook has
    // somewhere to move to rather than simply running out of options.
    act(() => setZoneAlertOverride("zone-1", "none"));
    rerender();
    act(() => result.current.handleFindSafeEvacuationCenter());
    expect(result.current.routeZone?.id).toBe("zone-1");

    act(() => setZoneAlertOverride("zone-1", "evacuate"));
    rerender();
    act(() => result.current.handleFindSafeEvacuationCenter());

    expect(result.current.routeZone?.id).toBe("zone-4");
    expect(result.current.notice).toBeNull();
  });

  it("reports a notice rather than a destination when every zone is hazardous", () => {
    const { result, rerender } = renderHook(() => useRouteFinding(MOCK_ZONES));

    act(() => {
      for (const zone of MOCK_ZONES) setZoneAlertOverride(zone.id, "evacuate");
    });
    rerender();
    act(() => result.current.handleFindSafeEvacuationCenter());

    expect(result.current.notice).not.toBeNull();
  });

  it("finds a Safe zone for the separate find-safe-area action", () => {
    const { result, rerender } = renderHook(() => useRouteFinding(MOCK_ZONES));

    // Clear zone-4's alert so exactly one zone reads Safe.
    act(() => setZoneAlertOverride("zone-4", "none"));
    rerender();
    act(() => result.current.handleFindSafeArea());

    expect(result.current.routeZone?.id).toBe("zone-4");
    expect(result.current.notice).toBeNull();
  });
});
