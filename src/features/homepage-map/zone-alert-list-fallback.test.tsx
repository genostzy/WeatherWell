import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { ZoneAlertListFallback } from "./zone-alert-list-fallback";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

describe("ZoneAlertListFallback", () => {
  it("lists every zone by name", () => {
    renderWithData(<ZoneAlertListFallback zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("explains that this is a no-map fallback", () => {
    renderWithData(<ZoneAlertListFallback zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByText(/no connection|offline|no internet/i)).toBeInTheDocument();
  });
});
