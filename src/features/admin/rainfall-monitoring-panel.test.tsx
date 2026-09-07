import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RainfallMonitoringPanel } from "./rainfall-monitoring-panel";
import { getRainfallForZone, isHeavyRainfall } from "@/lib/mock-data";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

describe("RainfallMonitoringPanel", () => {
  it("shows the current mm/hr reading for every zone", () => {
    render(<RainfallMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(String(getRainfallForZone(zone.id)))).toBeInTheDocument();
    }
  });

  it("badges a zone Heavy only when its own reading crosses the threshold", () => {
    render(<RainfallMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    const heavyCount = FIXTURE_REFERENCE_DATA.zones.filter((z) => isHeavyRainfall(getRainfallForZone(z.id))).length;
    const normalCount = FIXTURE_REFERENCE_DATA.zones.length - heavyCount;
    expect(screen.getAllByText("Heavy")).toHaveLength(heavyCount);
    expect(screen.getAllByText("Normal")).toHaveLength(normalCount);
  });

  it("draws a 12-hour trend line for every zone", () => {
    const { container } = render(<RainfallMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(FIXTURE_REFERENCE_DATA.zones.length);
  });
});
