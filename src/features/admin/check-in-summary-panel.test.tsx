import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckInSummaryPanel } from "./check-in-summary-panel";
import { recordCheckIn, type EvacuationCheckIn } from "@/lib/evacuation-checkins";

/** recordCheckIn replaces this device's own prior check-in, so simulating two residents needs two device ids written directly rather than two recordCheckIn calls (which would just overwrite each other). */
function seedCheckIns(checkIns: EvacuationCheckIn[]): void {
  localStorage.setItem("weatherwell.evacuationCheckIns", JSON.stringify(checkIns));
}

describe("CheckInSummaryPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows an empty state when nobody has checked in for the zone", () => {
    render(<CheckInSummaryPanel zoneId="zone-1" />);
    expect(screen.getByText(/no check-ins yet/i)).toBeInTheDocument();
  });

  it("counts safe and needs-help check-ins separately", () => {
    seedCheckIns([
      { id: "c1", zoneId: "zone-1", deviceId: "device-a", status: "safe", checkedInAt: new Date().toISOString() },
      { id: "c2", zoneId: "zone-1", deviceId: "device-b", status: "needs_help", checkedInAt: new Date().toISOString() },
    ]);
    render(<CheckInSummaryPanel zoneId="zone-1" />);
    // One "1" for the safe count, one "1" for the needs-help count.
    expect(screen.getAllByText("1", { exact: true })).toHaveLength(2);
  });

  it("only counts check-ins for the requested zone, not other zones", () => {
    recordCheckIn("zone-1", "safe");
    recordCheckIn("zone-2", "needs_help");
    render(<CheckInSummaryPanel zoneId="zone-1" />);
    // zone-1 has one "safe" and zero "needs_help" — the zone-2 needs_help entry must not count here.
    expect(screen.getByText(/checked in safe/i)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
