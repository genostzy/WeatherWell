import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertTriangle } from "lucide-react";
import { StatCard } from "./stat-card";

describe("StatCard", () => {
  it("shows the label, value, and unit", () => {
    render(<StatCard label="Heaviest rainfall" value={32} unit="mm/hr" icon={AlertTriangle} />);
    expect(screen.getByText("Heaviest rainfall")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
    expect(screen.getByText("mm/hr")).toBeInTheDocument();
  });

  it("shows an optional hint beneath the value", () => {
    render(<StatCard label="Zones under alert" value={4} hint="of 4" icon={AlertTriangle} />);
    expect(screen.getByText("of 4")).toBeInTheDocument();
  });

  it("accepts a string value for non-numeric stats like a typhoon name", () => {
    render(<StatCard label="Tropical cyclone" value="Basyang" icon={AlertTriangle} />);
    expect(screen.getByText("Basyang")).toBeInTheDocument();
  });
});
