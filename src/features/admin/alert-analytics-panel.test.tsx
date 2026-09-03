import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertAnalyticsPanel } from "./alert-analytics-panel";
import { MOCK_ZONES, getFalseAlarmRate } from "@/lib/mock-data";

describe("AlertAnalyticsPanel", () => {
  it("computes and shows the PRD's false-alarm-rate metric against its own ≤10% target", () => {
    render(<AlertAnalyticsPanel zones={MOCK_ZONES} />);
    const rate = getFalseAlarmRate();
    expect(screen.getByText(`${rate}%`)).toBeInTheDocument();
    expect(screen.getByText(rate <= 10 ? "On target" : "Over target")).toBeInTheDocument();
    expect(screen.getByText(/PRD target/)).toBeInTheDocument();
  });

  it("shows alerts issued per zone with downgrades called out, not hidden", () => {
    render(<AlertAnalyticsPanel zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/downgraded/i).length).toBeGreaterThan(0);
  });

  it("states plainly that a downgrade is always shown, never silently removed", () => {
    render(<AlertAnalyticsPanel zones={MOCK_ZONES} />);
    expect(screen.getByText(/never silently removed/i)).toBeInTheDocument();
  });
});
