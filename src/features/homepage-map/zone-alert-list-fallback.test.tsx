import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZoneAlertListFallback } from "./zone-alert-list-fallback";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("ZoneAlertListFallback", () => {
  it("lists every zone by name", () => {
    render(<ZoneAlertListFallback zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("explains that this is a no-map fallback", () => {
    render(<ZoneAlertListFallback zones={MOCK_ZONES} />);
    expect(screen.getByText(/no connection|offline|no internet/i)).toBeInTheDocument();
  });
});
