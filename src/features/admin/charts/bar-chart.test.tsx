import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarChart } from "./bar-chart";

describe("BarChart", () => {
  it("renders one row per datum, labeled and with its value", () => {
    render(
      <BarChart
        data={[
          { label: "Zone A", value: 10, color: "#f00" },
          { label: "Zone B", value: 20, color: "#0f0" },
        ]}
      />
    );
    expect(screen.getByText("Zone A")).toBeInTheDocument();
    expect(screen.getByText("Zone B")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("scales each bar's width relative to the largest value", () => {
    const { container } = render(
      <BarChart
        data={[
          { label: "Half", value: 5, color: "#f00" },
          { label: "Full", value: 10, color: "#0f0" },
        ]}
      />
    );
    const bars = container.querySelectorAll(".absolute.inset-y-0.left-0.rounded-sm");
    // No subValue on either row, so exactly one fill div per row.
    expect(bars[0]).toHaveStyle({ width: "50%" });
    expect(bars[1]).toHaveStyle({ width: "100%" });
  });

  it("appends the unit to every value", () => {
    render(
      <BarChart data={[{ label: "Zone A", value: 18, color: "#f00" }]} unit=" mm/hr" />
    );
    expect(screen.getByText(/18\s*mm\/hr/)).toBeInTheDocument();
  });

  it("shows a subValue inset with its own label, e.g. downgraded alerts", () => {
    render(
      <BarChart
        data={[{ label: "Zone A", value: 7, subValue: 2, subLabel: "downgraded", color: "#f00" }]}
      />
    );
    expect(screen.getByText(/2 downgraded/)).toBeInTheDocument();
  });

  it("honors an externally pinned max scale instead of each chart's own peak", () => {
    const { container } = render(
      <BarChart data={[{ label: "Zone A", value: 5, color: "#f00" }]} maxValue={20} />
    );
    const bar = container.querySelector(".absolute.inset-y-0.left-0.rounded-sm");
    expect(bar).toHaveStyle({ width: "25%" });
  });
});
