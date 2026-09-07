import { describe, it, expect } from "vitest";
import { toAlertRecords } from "./alerts-mapper";

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
