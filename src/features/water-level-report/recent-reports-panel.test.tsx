import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentReportsPanel } from "./recent-reports-panel";
import { MOCK_ZONES, MOCK_WATER_LEVEL_REPORTS, REPORT_THRESHOLD } from "@/lib/mock-data";
import { addWaterLevelReport } from "@/lib/water-level-reports";
import { DEPTH_LABEL } from "@/lib/depth";

describe("RecentReportsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lists every recent report for the zone", () => {
    const zone = MOCK_ZONES[0];
    render(<RecentReportsPanel zone={zone} />);

    for (const report of MOCK_WATER_LEVEL_REPORTS.filter((r) => r.zoneId === zone.id)) {
      expect(screen.getAllByText(new RegExp(DEPTH_LABEL[report.depthLevel].en, "i")).length).toBeGreaterThan(0);
    }
  });

  it("counts only agreeing reports toward the threshold, excluding outliers", () => {
    const zone = MOCK_ZONES[0];
    const zoneReports = MOCK_WATER_LEVEL_REPORTS.filter((r) => r.zoneId === zone.id);
    const agreeing = zoneReports.filter((report) => !report.isOutlier).length;
    // zone-1's fixture deliberately includes one outlier, so this proves the
    // count excludes it rather than just matching the raw report total.
    expect(agreeing).toBeLessThan(zoneReports.length);

    render(<RecentReportsPanel zone={zone} />);
    expect(screen.getByText(String(agreeing))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${REPORT_THRESHOLD} reports needed`, "i"))).toBeInTheDocument();
  });

  it("marks an outlier as downweighted rather than hiding it", () => {
    render(<RecentReportsPanel zone={MOCK_ZONES[0]} />);
    expect(screen.getByText(/downweighted/i)).toBeInTheDocument();
  });

  it("invites the first report when a zone has none", () => {
    localStorage.setItem("weatherwell.waterLevelReports", "[]");
    render(<RecentReportsPanel zone={{ ...MOCK_ZONES[0], id: "zone-with-no-reports" }} />);
    expect(screen.getByText(/yours would be the first/i)).toBeInTheDocument();
  });

  it("shows a freshly submitted report immediately, not just the seeded ones", () => {
    localStorage.setItem("weatherwell.waterLevelReports", "[]");
    const zone = MOCK_ZONES[0];
    addWaterLevelReport(zone.id, "neck");

    render(<RecentReportsPanel zone={zone} />);

    expect(screen.getByText("1")).toBeInTheDocument(); // one agreeing report
    expect(screen.getByText(/neck-deep/i)).toBeInTheDocument();
    expect(screen.getByText(/0 min ago/i)).toBeInTheDocument();
  });
});
