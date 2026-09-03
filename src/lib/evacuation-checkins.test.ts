import { describe, it, expect, beforeEach } from "vitest";
import {
  recordCheckIn,
  getCheckInsForZone,
  getOwnCheckInForZone,
  type EvacuationCheckIn,
} from "./evacuation-checkins";

function readStored(): EvacuationCheckIn[] {
  const raw = localStorage.getItem("weatherwell.evacuationCheckIns");
  return raw ? JSON.parse(raw) : [];
}

describe("evacuation-checkins", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records a check-in that a fresh read of the store then contains", () => {
    recordCheckIn("zone-1", "safe");
    const stored = readStored();
    expect(stored).toHaveLength(1);
    expect(stored[0].zoneId).toBe("zone-1");
    expect(stored[0].status).toBe("safe");
  });

  it("replaces this device's prior check-in for the same zone instead of appending a second one", () => {
    recordCheckIn("zone-1", "safe");
    recordCheckIn("zone-1", "needs_help");
    const stored = readStored();
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe("needs_help");
  });

  it("keeps separate check-ins for different zones from the same device", () => {
    recordCheckIn("zone-1", "safe");
    recordCheckIn("zone-2", "needs_help");
    expect(readStored()).toHaveLength(2);
  });

  it("filters check-ins by zone", () => {
    recordCheckIn("zone-1", "safe");
    recordCheckIn("zone-2", "needs_help");
    const zone1CheckIns = getCheckInsForZone(readStored(), "zone-1");
    expect(zone1CheckIns).toHaveLength(1);
    expect(zone1CheckIns[0].zoneId).toBe("zone-1");
  });

  it("finds this device's own check-in for a zone", () => {
    recordCheckIn("zone-1", "needs_help");
    const own = getOwnCheckInForZone(readStored(), "zone-1");
    expect(own?.status).toBe("needs_help");
  });

  it("returns undefined when this device hasn't checked in for a zone", () => {
    expect(getOwnCheckInForZone([], "zone-1")).toBeUndefined();
  });
});
