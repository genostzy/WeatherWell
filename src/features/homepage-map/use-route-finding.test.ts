import { createElement, type ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRouteFinding } from "./use-route-finding";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { getZoneStatus } from "@/lib/zone-status";
import { AlertsContext } from "@/lib/alerts-store";
import { getActiveAlertForZone, MOCK_ALERTS } from "@/lib/mock-data";
import type { AlertRecord } from "@/lib/types";

/**
 * useRouteFinding calls useAlerts() internally, so every renderHook needs an
 * AlertsContext ancestor. The wrapper reads `alerts` from this closure rather
 * than from props — renderHook's `wrapper` option is only ever given
 * `{children}`, never the hook's own props — so a test that needs to change
 * what a zone's alert says mid-test mutates `alerts` and calls `rerender()`;
 * React re-invokes the wrapper function on that render and picks up the new
 * value, the same way a real <AlertsContext.Provider> would pick up a new
 * server response.
 */
function renderRouteFinding(initialAlerts: AlertRecord[]) {
  let alerts = initialAlerts;
  const utils = renderHook(() => useRouteFinding(FIXTURE_REFERENCE_DATA.zones), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(AlertsContext.Provider, { value: alerts }, children),
  });
  return {
    ...utils,
    setAlerts: (next: AlertRecord[]) => {
      alerts = next;
      utils.rerender();
    },
  };
}

/** MOCK_ALERTS with one zone's alert replaced — the operator-action equivalent of the old setZoneAlertOverride. */
function withZoneAlert(zoneId: string, changes: Partial<AlertRecord>): AlertRecord[] {
  return MOCK_ALERTS.map((a) => (a.zoneId === zoneId ? { ...a, ...changes } : a));
}

/** Clears a zone's alert the way an operator's all-clear does: the row goes inactive rather than disappearing. */
function cleared(zoneId: string): AlertRecord[] {
  return withZoneAlert(zoneId, { isActive: false });
}

/**
 * The two "find safe" actions are the ones a resident reaches for when the
 * plan they had has stopped working, so what matters is that neither can name
 * somewhere the operator is currently evacuating.
 */
describe("useRouteFinding", () => {
  it("never offers an evacuation center in a Dangerous or Hazardous zone", () => {
    // The shipped barangays sit kilometres apart, so no route trips the
    // proximity check and the route test alone says every zone is fine —
    // which previously meant zone-1 (Dangerous in mock data) was offered as
    // the "safe evacuation center".
    const { result } = renderRouteFinding(MOCK_ALERTS);

    act(() => result.current.handleFindSafeEvacuationCenter());

    const chosen = result.current.routeZone;
    if (chosen) {
      const status = getZoneStatus(getActiveAlertForZone(chosen.id));
      expect(["safe", "cautionary"]).toContain(status);
    } else {
      expect(result.current.notice).not.toBeNull();
    }
  });

  it("moves to another center once an operator escalates the one it offered", () => {
    // Clear zone-1 so there are two acceptable destinations, and the hook has
    // somewhere to move to rather than simply running out of options.
    const { result, setAlerts } = renderRouteFinding(cleared("zone-1"));

    act(() => result.current.handleFindSafeEvacuationCenter());
    expect(result.current.routeZone?.id).toBe("zone-1");

    act(() => setAlerts(withZoneAlert("zone-1", { severity: "evacuate", isActive: true })));
    act(() => result.current.handleFindSafeEvacuationCenter());

    expect(result.current.routeZone?.id).toBe("zone-4");
    expect(result.current.notice).toBeNull();
  });

  it("reports a notice rather than a destination when every zone is hazardous", () => {
    const allEvacuating = MOCK_ALERTS.map((a) => ({ ...a, severity: "evacuate" as const }));
    const { result } = renderRouteFinding(allEvacuating);

    act(() => result.current.handleFindSafeEvacuationCenter());

    expect(result.current.notice).not.toBeNull();
  });

  it("finds a Safe zone for the separate find-safe-area action", () => {
    // Clear zone-4's alert so exactly one zone reads Safe.
    const { result } = renderRouteFinding(cleared("zone-4"));

    act(() => result.current.handleFindSafeArea());

    expect(result.current.routeZone?.id).toBe("zone-4");
    expect(result.current.notice).toBeNull();
  });
});
