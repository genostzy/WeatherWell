import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportTrendPanel } from "./report-trend-panel";
import { MOCK_ZONES, getReportHistoryForZone } from "@/lib/mock-data";

describe("ReportTrendPanel", () => {
  it("totals the week's reports across every zone, not just one", () => {
    render(<ReportTrendPanel zones={MOCK_ZONES} />);
    const expectedTotal = MOCK_ZONES.reduce(
      (sum, zone) => sum + getReportHistoryForZone(zone.id).reduce((a, b) => a + b, 0),
      0
    );
    expect(screen.getByText(String(expectedTotal))).toBeInTheDocument();
  });

  it("draws a 7-day trend line per zone", () => {
    const { container } = render(<ReportTrendPanel zones={MOCK_ZONES} />);
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(MOCK_ZONES.length);
  });

  it("shows today's report count per zone as a bar", () => {
    render(<ReportTrendPanel zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      const history = getReportHistoryForZone(zone.id);
      const today = history[history.length - 1];
      expect(screen.getAllByText(String(today)).length).toBeGreaterThan(0);
    }
  });
});
