import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FloodMonitoringPanel } from "./flood-monitoring-panel";
import { MOCK_ZONES, getRecentReportsForZone, REPORT_THRESHOLD } from "@/lib/mock-data";

describe("FloodMonitoringPanel", () => {
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
        getRecentReportsForZone(zone.id).filter((r) => !r.isOutlier).length >= REPORT_THRESHOLD
    );
    expect(zoneWithEnough).toBeDefined();
    expect(screen.getAllByText(/report threshold met/i).length).toBeGreaterThan(0);
  });

  it("shows the latest report's depth and age for a zone with reports", () => {
    render(<FloodMonitoringPanel zones={MOCK_ZONES} />);
    const zoneWithReports = MOCK_ZONES.find((z) => getRecentReportsForZone(z.id).length > 0)!;
    const latest = getRecentReportsForZone(zoneWithReports.id)[0];
    expect(screen.getByText(new RegExp(`${latest.minutesAgo} min ago`))).toBeInTheDocument();
  });
});
