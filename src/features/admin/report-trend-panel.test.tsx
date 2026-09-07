import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportTrendPanel } from "./report-trend-panel";
import { getReportHistoryForZone } from "@/lib/mock-data";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

describe("ReportTrendPanel", () => {
  it("totals the week's reports across every zone, not just one", () => {
    render(<ReportTrendPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    const expectedTotal = FIXTURE_REFERENCE_DATA.zones.reduce(
      (sum, zone) => sum + getReportHistoryForZone(zone.id).reduce((a, b) => a + b, 0),
      0
    );
    expect(screen.getByText(String(expectedTotal))).toBeInTheDocument();
  });

  it("draws a 7-day trend line per zone", () => {
    const { container } = render(<ReportTrendPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(FIXTURE_REFERENCE_DATA.zones.length);
  });

  it("shows today's report count per zone as a bar", () => {
    render(<ReportTrendPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      const history = getReportHistoryForZone(zone.id);
      const today = history[history.length - 1];
      expect(screen.getAllByText(String(today)).length).toBeGreaterThan(0);
    }
  });
});
