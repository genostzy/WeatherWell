import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { FloodMonitoringPanel } from "./flood-monitoring-panel";
import { MOCK_WATER_LEVEL_REPORTS, REPORT_THRESHOLD } from "@/lib/mock-data";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

describe("FloodMonitoringPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows every zone with a manage link back to its dashboard", () => {
    renderWithData(<FloodMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
    const manageLinks = screen.getAllByRole("link", { name: /manage/i });
    expect(manageLinks).toHaveLength(FIXTURE_REFERENCE_DATA.zones.length);
    expect(manageLinks[0]).toHaveAttribute("href", `/admin/zone/${FIXTURE_REFERENCE_DATA.zones[0].id}`);
  });

  it("flags a zone whose agreeing reports have met the auto-trigger threshold", () => {
    renderWithData(<FloodMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    const zoneWithEnough = FIXTURE_REFERENCE_DATA.zones.find(
      (zone) =>
        MOCK_WATER_LEVEL_REPORTS.filter((r) => r.zoneId === zone.id && !r.isOutlier).length >=
        REPORT_THRESHOLD
    );
    expect(zoneWithEnough).toBeDefined();
    expect(screen.getAllByText(/report threshold met/i).length).toBeGreaterThan(0);
  });

  it("shows the latest report's depth for a zone with reports", () => {
    renderWithData(<FloodMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    const zoneWithReports = FIXTURE_REFERENCE_DATA.zones.find(
      (z) => MOCK_WATER_LEVEL_REPORTS.filter((r) => r.zoneId === z.id).length > 0
    )!;
    const latest = [...MOCK_WATER_LEVEL_REPORTS]
      .filter((r) => r.zoneId === zoneWithReports.id)
      .sort((a, b) => a.minutesAgo - b.minutesAgo)[0];
    expect(screen.getAllByText(new RegExp(latest.depthLevel, "i")).length).toBeGreaterThan(0);
  });
});
