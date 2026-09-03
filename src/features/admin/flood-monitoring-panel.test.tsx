import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FloodMonitoringPanel } from "./flood-monitoring-panel";
import { MOCK_ZONES, MOCK_WATER_LEVEL_REPORTS, REPORT_THRESHOLD } from "@/lib/mock-data";

describe("FloodMonitoringPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows every zone with a manage link back to its dashboard", () => {
    render(<FloodMonitoringPanel zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
    const manageLinks = screen.getAllByRole("link", { name: /manage/i });
    expect(manageLinks).toHaveLength(MOCK_ZONES.length);
    expect(manageLinks[0]).toHaveAttribute("href", `/admin/zone/${MOCK_ZONES[0].id}`);
  });

  it("flags a zone whose agreeing reports have met the auto-trigger threshold", () => {
    render(<FloodMonitoringPanel zones={MOCK_ZONES} />);
    const zoneWithEnough = MOCK_ZONES.find(
      (zone) =>
        MOCK_WATER_LEVEL_REPORTS.filter((r) => r.zoneId === zone.id && !r.isOutlier).length >=
        REPORT_THRESHOLD
    );
    expect(zoneWithEnough).toBeDefined();
    expect(screen.getAllByText(/report threshold met/i).length).toBeGreaterThan(0);
  });

  it("shows the latest report's depth for a zone with reports", () => {
    render(<FloodMonitoringPanel zones={MOCK_ZONES} />);
    const zoneWithReports = MOCK_ZONES.find(
      (z) => MOCK_WATER_LEVEL_REPORTS.filter((r) => r.zoneId === z.id).length > 0
    )!;
    const latest = [...MOCK_WATER_LEVEL_REPORTS]
      .filter((r) => r.zoneId === zoneWithReports.id)
      .sort((a, b) => a.minutesAgo - b.minutesAgo)[0];
    expect(screen.getAllByText(new RegExp(latest.depthLevel, "i")).length).toBeGreaterThan(0);
  });
});
