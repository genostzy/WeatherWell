import { describe, it, expect, beforeEach } from "vitest";
import {
  addWaterLevelReport,
  getRecentReportsForZoneLive,
  minutesSinceReport,
} from "./water-level-reports";

function readStored(): unknown[] {
  const raw = localStorage.getItem("weatherwell.waterLevelReports");
  return raw ? JSON.parse(raw) : [];
}

describe("water-level-reports", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("seeds from the mock data when nothing has been submitted yet", () => {
    localStorage.setItem("weatherwell.waterLevelReports", "[]");
    addWaterLevelReport("zone-1", "knee");
    const stored = readStored() as { zoneId: string }[];
    // Only the one just added — an empty array, not "missing", must not fall back to seeds.
    expect(stored).toHaveLength(1);
  });

  it("adds a report that a fresh read of the store then contains", () => {
    localStorage.setItem("weatherwell.waterLevelReports", "[]");
    addWaterLevelReport("zone-2", "waist");

    const reports = getRecentReportsForZoneLive(
      JSON.parse(localStorage.getItem("weatherwell.waterLevelReports")!),
      "zone-2"
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].depthLevel).toBe("waist");
  });

  it("gives a freshly submitted report a fresh device and starting trust weight", () => {
    localStorage.setItem("weatherwell.waterLevelReports", "[]");
    addWaterLevelReport("zone-1", "dry");
    const [report] = readStored() as { trustWeight: number; isOutlier: boolean; deviceId: string }[];
    // 1.0 is PRD's own definition of "unproven device" — reputation scoring is Final Phase.
    expect(report.trustWeight).toBe(1.0);
    expect(report.isOutlier).toBe(false);
    expect(report.deviceId).toBeTruthy();
  });

  it("orders reports newest first", () => {
    localStorage.setItem("weatherwell.waterLevelReports", "[]");
    addWaterLevelReport("zone-3", "ankle");
    addWaterLevelReport("zone-3", "knee");

    const reports = getRecentReportsForZoneLive(JSON.parse(readStoredRaw()), "zone-3");
    expect(reports[0].depthLevel).toBe("knee");
    expect(reports[1].depthLevel).toBe("ankle");
  });

  it("reports a just-submitted entry as 0 minutes ago", () => {
    const now = new Date().toISOString();
    expect(minutesSinceReport(now)).toBe(0);
  });

  it("only counts reports for the requested zone", () => {
    localStorage.setItem("weatherwell.waterLevelReports", "[]");
    addWaterLevelReport("zone-1", "dry");
    addWaterLevelReport("zone-2", "neck");

    const reports = getRecentReportsForZoneLive(JSON.parse(readStoredRaw()), "zone-1");
    expect(reports).toHaveLength(1);
    expect(reports[0].zoneId).toBe("zone-1");
  });
});

function readStoredRaw(): string {
  return localStorage.getItem("weatherwell.waterLevelReports")!;
}
