import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeverityBadge } from "./severity-badge";

describe("SeverityBadge", () => {
  it("shows the human-readable label for the severity", () => {
    render(<SeverityBadge severity="red" />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("applies the matching severity color class", () => {
    render(<SeverityBadge severity="red" />);
    expect(screen.getByText("Warning")).toHaveClass("bg-severity-red");
  });

  it("uses the evacuate styling for the top severity", () => {
    render(<SeverityBadge severity="evacuate" />);
    expect(screen.getByText("Evacuate Now")).toHaveClass("bg-severity-evacuate");
  });
});
