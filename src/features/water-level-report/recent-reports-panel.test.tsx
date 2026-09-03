import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentReportsPanel } from "./recent-reports-panel";
import { MOCK_ZONES, getRecentReportsForZone, REPORT_THRESHOLD } from "@/lib/mock-data";
import { DEPTH_LABEL } from "@/lib/depth";

describe("RecentReportsPanel", () => {
  it("lists every recent report for the zone", () => {
    const zone = MOCK_ZONES[0];
    render(<RecentReportsPanel zone={zone} />);

    for (const report of getRecentReportsForZone(zone.id)) {
      expect(screen.getAllByText(new RegExp(DEPTH_LABEL[report.depthLevel].en, "i")).length).toBeGreaterThan(0);
    }
  });

  it("counts only agreeing reports toward the threshold, excluding outliers", () => {
    const zone = MOCK_ZONES[0];
    const reports = getRecentReportsForZone(zone.id);
    const agreeing = reports.filter((report) => !report.isOutlier).length;
    // zone-1's fixture deliberately includes one outlier, so this proves the
    // count excludes it rather than just matching the raw report total.
    expect(agreeing).toBeLessThan(reports.length);

    render(<RecentReportsPanel zone={zone} />);
    expect(screen.getByText(String(agreeing))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${REPORT_THRESHOLD} reports needed`, "i"))).toBeInTheDocument();
  });

  it("marks an outlier as downweighted rather than hiding it", () => {
    render(<RecentReportsPanel zone={MOCK_ZONES[0]} />);
    expect(screen.getByText(/downweighted/i)).toBeInTheDocument();
  });

  it("invites the first report when a zone has none", () => {
    render(<RecentReportsPanel zone={{ ...MOCK_ZONES[0], id: "zone-with-no-reports" }} />);
    expect(screen.getByText(/yours would be the first/i)).toBeInTheDocument();
  });
});
