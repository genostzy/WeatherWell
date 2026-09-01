import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZoneMap } from "./zone-map";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("ZoneMap", () => {
  it("renders a labeled region for every zone", () => {
    render(<ZoneMap zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("renders one region per zone, not a single merged block", () => {
    const { container } = render(<ZoneMap zones={MOCK_ZONES} />);
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(
      MOCK_ZONES.length
    );
  });

  it("is honest that real boundary data is not wired yet", () => {
    render(<ZoneMap zones={MOCK_ZONES} />);
    expect(screen.getByText(/phase 2/i)).toBeInTheDocument();
  });
});
