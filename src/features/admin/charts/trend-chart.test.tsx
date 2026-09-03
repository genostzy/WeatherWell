import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendChart } from "./trend-chart";

describe("TrendChart", () => {
  it("renders nothing for a series too short to draw a line", () => {
    const { container } = render(<TrendChart series={[5]} color="#000" label="test" />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty series", () => {
    const { container } = render(<TrendChart series={[]} color="#000" label="test" />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("describes the actual shape (start/now/peak/low), not just a first-vs-last direction", () => {
    // Peaks mid-series then falls back — a naive first-vs-last comparison
    // would call this "falling", which misrepresents what actually happened.
    render(<TrendChart series={[10, 30, 15]} color="#000" label="Rainfall" unit="mm/hr" />);
    const svg = screen.getByRole("img");
    expect(svg).toHaveAttribute(
      "aria-label",
      "Rainfall: starts at 10mm/hr, now 15mm/hr. Peak 30mm/hr, low 10mm/hr."
    );
  });

  it("plots one point per series value", () => {
    const { container } = render(
      <TrendChart series={[1, 2, 3, 4, 5]} color="#000" label="test" />
    );
    const linePath = container.querySelector("path[stroke]");
    // "M x y" for the first point, then "L x y" for each remaining point.
    expect(linePath?.getAttribute("d")?.split(" L").length).toBe(5);
  });

  it("still renders a usable line when every value is identical", () => {
    // max - min would be 0, which must not divide by zero.
    const { container } = render(
      <TrendChart series={[7, 7, 7]} color="#000" label="flat" />
    );
    const linePath = container.querySelector("path[stroke]");
    expect(linePath?.getAttribute("d")).not.toContain("NaN");
  });

  it("marks the latest reading with a dot at the end of the line", () => {
    const { container } = render(
      <TrendChart series={[1, 2, 3]} color="#0f0" label="test" />
    );
    const circle = container.querySelector("circle");
    expect(circle).toHaveAttribute("fill", "#0f0");
  });
});
