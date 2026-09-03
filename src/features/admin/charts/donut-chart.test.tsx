import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DonutChart } from "./donut-chart";

describe("DonutChart", () => {
  it("shows the center value and label prominently", () => {
    render(
      <DonutChart
        label="Capacity"
        centerValue="3/4"
        centerLabel="still have space"
        segments={[
          { label: "Space available", value: 3, color: "#22c55e" },
          { label: "Full", value: 1, color: "#dc2626" },
        ]}
      />
    );
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText("still have space")).toBeInTheDocument();
  });

  it("lists every segment in the legend, including zero-value ones", () => {
    render(
      <DonutChart
        label="Capacity"
        centerValue="0/1"
        centerLabel="none"
        segments={[
          { label: "Space available", value: 0, color: "#22c55e" },
          { label: "Full", value: 1, color: "#dc2626" },
        ]}
      />
    );
    expect(screen.getByText(/Space available/)).toBeInTheDocument();
    expect(screen.getByText(/Full/)).toBeInTheDocument();
  });

  it("draws an arc only for segments with a positive value", () => {
    const { container } = render(
      <DonutChart
        label="Capacity"
        centerValue="1/3"
        centerLabel="test"
        segments={[
          { label: "A", value: 0, color: "#111" },
          { label: "B", value: 0, color: "#222" },
          { label: "C", value: 1, color: "#333" },
        ]}
      />
    );
    // One background track circle plus exactly one colored arc circle.
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("splits the ring proportionally without gaps or overlaps", () => {
    const { container } = render(
      <DonutChart
        label="Capacity"
        centerValue="2/4"
        centerLabel="test"
        segments={[
          { label: "Half", value: 1, color: "#111" },
          { label: "OtherHalf", value: 1, color: "#222" },
        ]}
      />
    );
    const arcs = [...container.querySelectorAll("circle")].slice(1); // drop the background track
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    for (const arc of arcs) {
      const [dash] = arc.getAttribute("stroke-dasharray")!.split(" ").map(Number);
      expect(dash).toBeCloseTo(circumference / 2, 1);
    }
    // Second arc's offset should pick up exactly where the first left off.
    const offsets = arcs.map((arc) => Number(arc.getAttribute("stroke-dashoffset")));
    expect(offsets[0]).toBeCloseTo(0, 5);
    expect(offsets[1]).toBeCloseTo(-circumference / 2, 1);
  });

  it("describes the full composition in one accessible label", () => {
    render(
      <DonutChart
        label="Capacity"
        centerValue="1/2"
        centerLabel="test"
        segments={[
          { label: "Space available", value: 1, color: "#111" },
          { label: "Full", value: 1, color: "#222" },
        ]}
      />
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "Capacity: 1 Space available, 1 Full."
    );
  });
});
