import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RainfallMonitoringPanel } from "./rainfall-monitoring-panel";
import { MOCK_ZONES, getRainfallForZone, isHeavyRainfall } from "@/lib/mock-data";

describe("RainfallMonitoringPanel", () => {
  it("shows the current mm/hr reading for every zone", () => {
    render(<RainfallMonitoringPanel zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(String(getRainfallForZone(zone.id)))).toBeInTheDocument();
    }
  });

  it("badges a zone Heavy only when its own reading crosses the threshold", () => {
    render(<RainfallMonitoringPanel zones={MOCK_ZONES} />);
    const heavyCount = MOCK_ZONES.filter((z) => isHeavyRainfall(getRainfallForZone(z.id))).length;
    const normalCount = MOCK_ZONES.length - heavyCount;
    expect(screen.getAllByText("Heavy")).toHaveLength(heavyCount);
    expect(screen.getAllByText("Normal")).toHaveLength(normalCount);
  });

  it("draws a 12-hour trend line for every zone", () => {
    const { container } = render(<RainfallMonitoringPanel zones={MOCK_ZONES} />);
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(MOCK_ZONES.length);
  });
});
