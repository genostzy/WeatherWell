import { describe, it, expect, beforeEach } from "vitest";
import {
  deriveCenterStatusFromOccupancy,
  resolveAlertDowngrade,
  resolveEffectiveAlert,
  resolveEffectiveCenterStatus,
  setZoneOccupancyOverride,
} from "./zone-overrides";
import { getActiveAlertForZone } from "./mock-data";
import { SEVERITY_ACTION_STEP } from "./severity";

describe("deriveCenterStatusFromOccupancy", () => {
  it("reads space_available below the limited threshold", () => {
    expect(deriveCenterStatusFromOccupancy(100, 69)).toBe("space_available");
  });

  it("reads limited at and above 70% occupancy", () => {
    expect(deriveCenterStatusFromOccupancy(100, 70)).toBe("limited");
    expect(deriveCenterStatusFromOccupancy(100, 94)).toBe("limited");
  });

  it("reads full at and above 95% occupancy", () => {
    expect(deriveCenterStatusFromOccupancy(100, 95)).toBe("full");
    expect(deriveCenterStatusFromOccupancy(100, 150)).toBe("full");
  });

  it("treats zero or negative capacity as full rather than dividing by zero", () => {
    expect(deriveCenterStatusFromOccupancy(0, 0)).toBe("full");
  });
});

describe("resolveEffectiveCenterStatus", () => {
  it("derives from occupancy when both capacity and occupancy are known, ignoring the manual override", () => {
    expect(resolveEffectiveCenterStatus("space_available", "full", 100, 10)).toBe("space_available");
  });

  it("falls back to the manual override when occupancy isn't tracked", () => {
    expect(resolveEffectiveCenterStatus("space_available", "full", 100, undefined)).toBe("full");
  });

  it("falls back to the zone default when neither override nor occupancy is set", () => {
    expect(resolveEffectiveCenterStatus("limited", undefined, undefined, undefined)).toBe("limited");
  });

  it("derives from a tracked headcount even when no manual status is set", () => {
    // The shape every page must call with: a page that omitted these got the
    // zone default while the rest of the app showed the derived status.
    expect(resolveEffectiveCenterStatus("space_available", undefined, 100, 98)).toBe("full");
  });
});

describe("setZoneOccupancyOverride", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists a headcount to the overrides store", () => {
    setZoneOccupancyOverride("zone-1", 42);
    const stored = JSON.parse(localStorage.getItem("weatherwell.zoneOverrides")!);
    expect(stored["zone-1"].currentOccupancy).toBe(42);
  });

  it("clears the headcount when set to undefined", () => {
    setZoneOccupancyOverride("zone-1", 42);
    setZoneOccupancyOverride("zone-1", undefined);
    const stored = JSON.parse(localStorage.getItem("weatherwell.zoneOverrides")!);
    expect(stored["zone-1"].currentOccupancy).toBeUndefined();
  });
});

describe("resolveEffectiveAlert", () => {
  const zoneWithEvacuateAlert = "zone-2";
  const zoneWithYellowAlert = "zone-4";

  it("keeps the original wording when the override matches the existing severity", () => {
    const base = getActiveAlertForZone(zoneWithEvacuateAlert)!;
    const resolved = resolveEffectiveAlert(zoneWithEvacuateAlert, "evacuate")!;
    expect(resolved.message.en).toBe(base.message.en);
  });

  it("does not carry evacuate wording onto a downgraded severity", () => {
    // An operator downgrading a zone must not leave residents reading
    // "Evacuate immediately" underneath an "Advisory" badge.
    const base = getActiveAlertForZone(zoneWithEvacuateAlert)!;
    expect(base.message.en).toContain("Evacuate immediately");

    const resolved = resolveEffectiveAlert(zoneWithEvacuateAlert, "yellow")!;
    expect(resolved.severity).toBe("yellow");
    expect(resolved.message.en).not.toContain("Evacuate immediately");
    expect(resolved.message.en).toContain(SEVERITY_ACTION_STEP.yellow.en);
  });

  it("does not carry stay-alert wording onto an escalation", () => {
    // The more dangerous direction: an "Evacuate Now" badge above copy that
    // tells the resident to stay put.
    const base = getActiveAlertForZone(zoneWithYellowAlert)!;
    expect(base.message.en).toContain("Stay alert");

    const resolved = resolveEffectiveAlert(zoneWithYellowAlert, "evacuate")!;
    expect(resolved.severity).toBe("evacuate");
    expect(resolved.message.en).not.toContain("Stay alert");
    expect(resolved.message.en).toContain(SEVERITY_ACTION_STEP.evacuate.en);
  });

  it("drops the predicted timing when the severity it described no longer applies", () => {
    expect(resolveEffectiveAlert(zoneWithEvacuateAlert, "yellow")!.predictedTiming).toBeUndefined();
    expect(resolveEffectiveAlert(zoneWithEvacuateAlert, "evacuate")!.predictedTiming).toBeDefined();
  });

  it("clears the alert entirely when the operator marks the zone resolved", () => {
    expect(resolveEffectiveAlert(zoneWithEvacuateAlert, "none")).toBeUndefined();
  });
});

describe("resolveAlertDowngrade", () => {
  const zoneWithEvacuateAlert = "zone-2";
  const zoneWithYellowAlert = "zone-4";

  it("reports a cleared alert, which would otherwise just vanish", () => {
    // The case this exists for. Clearing an override returns no alert at all,
    // so without a notice the most severe state in the system disappears from
    // the resident's screen with nothing said.
    const notice = resolveAlertDowngrade(zoneWithEvacuateAlert, "none")!;
    expect(notice.from).toBe("evacuate");
    expect(notice.to).toBe("none");
  });

  it("reports a lowered severity", () => {
    const notice = resolveAlertDowngrade(zoneWithEvacuateAlert, "yellow")!;
    expect(notice.from).toBe("evacuate");
    expect(notice.to).toBe("yellow");
  });

  it("stays silent on an escalation, which speaks for itself", () => {
    expect(resolveAlertDowngrade(zoneWithYellowAlert, "evacuate")).toBeUndefined();
  });

  it("stays silent when the override confirms the severity already in place", () => {
    expect(resolveAlertDowngrade(zoneWithEvacuateAlert, "evacuate")).toBeUndefined();
  });

  it("stays silent when there is no override at all", () => {
    expect(resolveAlertDowngrade(zoneWithEvacuateAlert, undefined)).toBeUndefined();
  });

  it("stays silent when there was no alert to downgrade", () => {
    // Clearing a zone that was never alerting is a no-op, not a downgrade —
    // announcing one would tell residents something changed when nothing did.
    expect(resolveAlertDowngrade("zone-with-no-alert", "none")).toBeUndefined();
  });
});
