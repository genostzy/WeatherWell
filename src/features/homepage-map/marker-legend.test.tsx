import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkerLegend } from "./marker-legend";

describe("MarkerLegend", () => {
  it("explains all four zone status labels", () => {
    render(<MarkerLegend />);
    expect(screen.getByText("Safe")).toBeInTheDocument();
    expect(screen.getByText("Cautionary")).toBeInTheDocument();
    expect(screen.getByText("Dangerous")).toBeInTheDocument();
    expect(screen.getByText("Hazardous")).toBeInTheDocument();
  });

  it("explains the evacuation and essential-service marker types", () => {
    render(<MarkerLegend />);
    expect(screen.getByText(/evacuation center/i)).toBeInTheDocument();
    expect(screen.getByText(/health center/i)).toBeInTheDocument();
    expect(screen.getByText(/pharmacy/i)).toBeInTheDocument();
    expect(screen.getByText(/market/i)).toBeInTheDocument();
    expect(screen.getByText(/water/i)).toBeInTheDocument();
    expect(screen.getByText(/barangay office/i)).toBeInTheDocument();
  });
});
