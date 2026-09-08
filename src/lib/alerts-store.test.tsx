import { createElement, type ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { toAlertRecords } from "./alerts-mapper";
import { AlertsContext, useAlerts, useActiveAlertForZone } from "./alerts-store";
import type { AlertRecord } from "./types";

const ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  zone_id: "zone-1",
  severity: "red",
  message: { en: "Knee-deep flooding reported.", fil: "May baha hanggang tuhod." },
  source: "manual",
  confidence: "validated",
  predicted_timing: null,
  issued_at: "2026-09-07T02:00:00.000Z",
  is_active: true,
  superseded_severity: null,
} as const;

describe("toAlertRecords", () => {
  it("maps a row to the AlertRecord shape the app already renders", () => {
    expect(toAlertRecords([ROW])[0]).toEqual({
      id: ROW.id,
      zoneId: "zone-1",
      severity: "red",
      message: ROW.message,
      source: "manual",
      confidence: "validated",
      predictedTiming: undefined,
      issuedAt: ROW.issued_at,
      isActive: true,
    });
  });

  it("carries predicted timing through when present", () => {
    const timing = { en: "within 3 hours", fil: "sa loob ng 3 oras" };
    expect(toAlertRecords([{ ...ROW, predicted_timing: timing }])[0].predictedTiming).toEqual(timing);
  });

  it("keeps superseded rows out of the active set", () => {
    // The response carries recently superseded alerts so a later plan can show
    // "Alert lifted". They must never render as live alerts.
    const records = toAlertRecords([{ ...ROW, is_active: false }]);
    expect(records[0].isActive).toBe(false);
  });
});

const ACTIVE_ALERT: AlertRecord = {
  id: "alert-active",
  zoneId: "zone-1",
  severity: "red",
  message: { en: "Knee-deep flooding reported.", fil: "May baha hanggang tuhod." },
  source: "manual",
  confidence: "validated",
  issuedAt: "2026-09-07T02:00:00.000Z",
  isActive: true,
};

/** A withdrawn/superseded alert for the same zone — the exact database row I7 is about. */
const SUPERSEDED_ALERT: AlertRecord = {
  ...ACTIVE_ALERT,
  id: "alert-superseded",
  severity: "yellow",
  isActive: false,
};

function withAlerts(alerts: AlertRecord[]) {
  return {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(AlertsContext.Provider, { value: alerts }, children),
  };
}

describe("useAlerts", () => {
  it("returns exactly what the provider supplied", () => {
    const { result } = renderHook(() => useAlerts(), withAlerts([ACTIVE_ALERT, SUPERSEDED_ALERT]));
    expect(result.current).toEqual([ACTIVE_ALERT, SUPERSEDED_ALERT]);
  });

  it("throws a directive error without an AlertsContext ancestor", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAlerts())).toThrow(/AlertsProvider/);
    quiet.mockRestore();
  });
});

describe("useActiveAlertForZone", () => {
  it("returns the zone's active alert", () => {
    const { result } = renderHook(
      () => useActiveAlertForZone("zone-1"),
      withAlerts([ACTIVE_ALERT])
    );
    expect(result.current).toEqual(ACTIVE_ALERT);
  });

  it("filters out a superseded row for the same zone rather than treating it as live", () => {
    // This is the only thing stopping a withdrawn evacuation order from
    // rendering as a live one now that the API ships superseded rows
    // alongside active ones within the downgrade window.
    const { result } = renderHook(
      () => useActiveAlertForZone("zone-1"),
      withAlerts([SUPERSEDED_ALERT])
    );
    expect(result.current).toBeUndefined();
  });

  it("picks the active alert over a superseded one for the same zone", () => {
    const { result } = renderHook(
      () => useActiveAlertForZone("zone-1"),
      withAlerts([SUPERSEDED_ALERT, ACTIVE_ALERT])
    );
    expect(result.current).toEqual(ACTIVE_ALERT);
  });

  it("returns undefined for a zone with no alert at all", () => {
    const { result } = renderHook(
      () => useActiveAlertForZone("zone-does-not-exist"),
      withAlerts([ACTIVE_ALERT])
    );
    expect(result.current).toBeUndefined();
  });
});
