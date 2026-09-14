import { describe, it, expect } from "vitest";
import { describeAction } from "./official-actions-copy";
import type { OfficialAction } from "./official-actions-mapper";

function action(overrides: Partial<OfficialAction>): OfficialAction {
  return {
    id: 1,
    occurredAt: "2026-09-14T02:14:00.000Z",
    actorName: "Juan Dela Cruz",
    actorArea: "0199901001",
    action: "alert.set",
    zoneId: "zone-1",
    targetId: "alert-1",
    detail: {},
    ...overrides,
  };
}

describe("describeAction", () => {
  it("alert.set, from null: Set to Orange", () => {
    const a = action({ action: "alert.set", detail: { from: null, to: "orange" } });
    expect(describeAction(a, "en")).toBe("Set to Orange");
  });

  it("alert.set, from null (fil)", () => {
    const a = action({ action: "alert.set", detail: { from: null, to: "orange" } });
    expect(describeAction(a, "fil")).toBe("Itinakda sa Orange");
  });

  it("alert.set, to lower than from: Lowered to Yellow", () => {
    const a = action({ action: "alert.set", detail: { from: "orange", to: "yellow" } });
    expect(describeAction(a, "en")).toBe("Lowered to Yellow");
  });

  it("alert.set, to lower than from (fil)", () => {
    const a = action({ action: "alert.set", detail: { from: "orange", to: "yellow" } });
    expect(describeAction(a, "fil")).toBe("Ibinaba sa Yellow");
  });

  it("alert.set, to higher than from: Raised to Evacuate", () => {
    const a = action({ action: "alert.set", detail: { from: "red", to: "evacuate" } });
    expect(describeAction(a, "en")).toBe("Raised to Evacuate");
  });

  it("alert.set, to equal to from: Confirmed Red", () => {
    const a = action({ action: "alert.set", detail: { from: "red", to: "red" } });
    expect(describeAction(a, "en")).toBe("Confirmed Red");
  });

  it("alert.cleared: Alert cleared", () => {
    const a = action({ action: "alert.cleared", detail: { from: "yellow" } });
    expect(describeAction(a, "en")).toBe("Alert cleared");
  });

  it("alert.cleared (fil)", () => {
    const a = action({ action: "alert.cleared", detail: { from: "yellow" } });
    expect(describeAction(a, "fil")).toBe("Naalis ang alerto");
  });

  it("centre.status: Evacuation centre: Limited space", () => {
    const a = action({ action: "centre.status", detail: { from: "space_available", to: "limited" } });
    expect(describeAction(a, "en")).toBe("Evacuation centre: Limited space");
  });

  it("centre.occupancy: Headcount: 120", () => {
    const a = action({ action: "centre.occupancy", detail: { from: 90, to: 120 } });
    expect(describeAction(a, "en")).toBe("Headcount: 120");
  });

  it("centre.occupancy, to null: Headcount cleared", () => {
    const a = action({ action: "centre.occupancy", detail: { from: 90, to: null } });
    expect(describeAction(a, "en")).toBe("Headcount cleared");
  });

  it("centre.occupancy, to null (fil)", () => {
    const a = action({ action: "centre.occupancy", detail: { from: 90, to: null } });
    expect(describeAction(a, "fil")).toBe("Nalinis ang bilang");
  });

  it("pin.removed, admin reason: Pin removed", () => {
    const a = action({ action: "pin.removed", detail: { reason: "admin" } });
    expect(describeAction(a, "en")).toBe("Pin removed");
  });

  it("pin.removed, net_score reason: Pin removed automatically (net score)", () => {
    const a = action({ action: "pin.removed", detail: { reason: "net_score" } });
    expect(describeAction(a, "en")).toBe("Pin removed automatically (net score)");
  });

  it("pin.removed, net_score reason (fil)", () => {
    const a = action({ action: "pin.removed", detail: { reason: "net_score" } });
    expect(describeAction(a, "fil")).toBe("Awtomatikong inalis ang pin (net score)");
  });

  it("pin.restored: Pin restored", () => {
    const a = action({ action: "pin.restored", detail: {} });
    expect(describeAction(a, "en")).toBe("Pin restored");
  });

  it("official.appointed: Appointed {display_name} for {area_name}", () => {
    const a = action({
      action: "official.appointed",
      zoneId: null,
      detail: { area: "0199901", area_name: "Uno, Testtown", display_name: "Juan Dela Cruz" },
    });
    expect(describeAction(a, "en")).toBe("Appointed Juan Dela Cruz for Uno, Testtown");
  });

  it("official.appointed (fil)", () => {
    const a = action({
      action: "official.appointed",
      zoneId: null,
      detail: { area: "0199901", area_name: "Uno, Testtown", display_name: "Juan Dela Cruz" },
    });
    expect(describeAction(a, "fil")).toBe("Itinalaga si Juan Dela Cruz para sa Uno, Testtown");
  });

  it("official.removed: Removed {display_name}", () => {
    const a = action({
      action: "official.removed",
      zoneId: null,
      detail: { area: "0199901", display_name: "Juan Dela Cruz" },
    });
    expect(describeAction(a, "en")).toBe("Removed Juan Dela Cruz");
  });

  it("official.removed (fil)", () => {
    const a = action({
      action: "official.removed",
      zoneId: null,
      detail: { area: "0199901", display_name: "Juan Dela Cruz" },
    });
    expect(describeAction(a, "fil")).toBe("Inalis si Juan Dela Cruz");
  });

  it("an unknown action degrades to a sensible sentence rather than blank or a crash", () => {
    const a = action({ action: "something.new", detail: { anything: true } });
    expect(describeAction(a, "en")).toBe("Action recorded: something.new");
    expect(describeAction(a, "fil")).toBe("Aksyong naitala: something.new");
  });

  it("alert.set with a malformed detail (missing to) degrades instead of crashing or rendering blank", () => {
    const a = action({ action: "alert.set", detail: {} });
    expect(() => describeAction(a, "en")).not.toThrow();
    expect(describeAction(a, "en")).not.toBe("");
  });

  it("centre.status with a malformed detail (missing to) degrades instead of crashing or rendering blank", () => {
    const a = action({ action: "centre.status", detail: {} });
    expect(() => describeAction(a, "en")).not.toThrow();
    expect(describeAction(a, "en")).not.toBe("");
  });
});
