import { describe, it, expect } from "vitest";
import { resolveAlertDowngrade } from "./alert-downgrade";
import type { AlertRecord } from "./types";

const alert = (over: Partial<AlertRecord>): AlertRecord => ({
  id: "a1",
  zoneId: "zone-1",
  severity: "yellow",
  message: { en: "", fil: "" },
  source: "manual",
  confidence: "validated",
  issuedAt: new Date().toISOString(),
  isActive: true,
  ...over,
});

describe("resolveAlertDowngrade", () => {
  it("announces a downgrade the operator made", () => {
    const notice = resolveAlertDowngrade([
      alert({ severity: "yellow", supersededSeverity: "evacuate" }),
    ]);

    expect(notice).toEqual({ from: "evacuate", to: "yellow" });
  });

  it("announces an alert that was lifted entirely", () => {
    // The case this exists for. With no active alert the badge simply stops
    // being rendered, and silence is exactly how a resident who has been told
    // to evacuate would experience an operator error, a bad automated
    // trigger, and a genuine all-clear — three very different situations that
    // must not look identical.
    const notice = resolveAlertDowngrade([
      alert({ severity: "evacuate", isActive: false }),
    ]);

    expect(notice).toEqual({ from: "evacuate", to: "none" });
  });

  it("says nothing about an escalation", () => {
    // Raising an alert already announces itself in the loudest way the
    // interface has. Only the quiet direction needs words.
    const notice = resolveAlertDowngrade([
      alert({ severity: "evacuate", supersededSeverity: "yellow" }),
    ]);

    expect(notice).toBeUndefined();
  });

  it("says nothing when an alert replaced nothing", () => {
    expect(resolveAlertDowngrade([alert({ severity: "red" })])).toBeUndefined();
  });

  it("says nothing for a zone with no alerts at all", () => {
    expect(resolveAlertDowngrade([])).toBeUndefined();
  });

  it("reads the newest alert, not whichever came first in the array", () => {
    const older = alert({ id: "old", severity: "red", isActive: false, issuedAt: "2026-09-01T00:00:00Z" });
    const newer = alert({ id: "new", severity: "yellow", supersededSeverity: "red", issuedAt: "2026-09-08T00:00:00Z" });

    expect(resolveAlertDowngrade([older, newer])).toEqual({ from: "red", to: "yellow" });
  });
});
