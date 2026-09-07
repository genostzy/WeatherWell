import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZoneAlertListFallback } from "./zone-alert-list-fallback";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

describe("ZoneAlertListFallback", () => {
  it("lists every zone by name", () => {
    render(<ZoneAlertListFallback zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("explains that this is a no-map fallback", () => {
    render(<ZoneAlertListFallback zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByText(/no connection|offline|no internet/i)).toBeInTheDocument();
  });
});
