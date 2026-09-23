import { describe, it, expect } from "vitest";
import { toOfficialActions, filterToArea, historyScope, type OfficialActionRow } from "./official-actions-mapper";

const ROW: OfficialActionRow = {
  id: 1,
  occurred_at: "2026-09-14T02:14:00.000Z",
  actor_name: "Juan Dela Cruz",
  actor_area: "0199901001",
  action: "alert.set",
  zone_id: "zone-1",
  target_id: "alert-1",
  detail: { from: "orange", to: "yellow", source: "manual" },
};

describe("toOfficialActions", () => {
  it("maps snake_case rows to OfficialAction", () => {
    expect(toOfficialActions([ROW])).toEqual([
      {
        id: 1,
        occurredAt: "2026-09-14T02:14:00.000Z",
        actorName: "Juan Dela Cruz",
        actorArea: "0199901001",
        action: "alert.set",
        zoneId: "zone-1",
        targetId: "alert-1",
        detail: { from: "orange", to: "yellow", source: "manual" },
      },
    ]);
  });

  it("carries a null actorArea and zoneId through untouched (appointment entries)", () => {
    const row: OfficialActionRow = {
      ...ROW,
      action: "official.appointed",
      zone_id: null,
      actor_area: null,
      detail: { area: "0199901", area_name: "Uno, Testtown", display_name: "Juan Dela Cruz" },
    };
    const [mapped] = toOfficialActions([row]);
    expect(mapped.zoneId).toBeNull();
    expect(mapped.actorArea).toBeNull();
  });

  it("never produces a field named actorId — actor_id must not leave the server", () => {
    const [mapped] = toOfficialActions([ROW]);
    expect(mapped).not.toHaveProperty("actorId");
  });
});

const ZONES = [
  { id: "zone-uno", psgcBarangayCode: "0199901001" },
  { id: "zone-dos", psgcBarangayCode: "0199901002" },
  { id: "zone-other-town", psgcBarangayCode: "0199902001" },
];

describe("filterToArea", () => {
  it("keeps entries whose zone is in the area", () => {
    const actions = toOfficialActions([{ ...ROW, zone_id: "zone-uno" }]);
    expect(filterToArea(actions, ZONES, "0199901")).toEqual(actions);
  });

  it("drops entries whose zone is outside the area", () => {
    const actions = toOfficialActions([{ ...ROW, zone_id: "zone-other-town" }]);
    expect(filterToArea(actions, ZONES, "0199901")).toEqual([]);
  });

  it("drops zone-less entries (appointment/removal actions) even under a matching area", () => {
    const actions = toOfficialActions([
      { ...ROW, action: "official.appointed", zone_id: null, detail: {} },
    ]);
    expect(filterToArea(actions, ZONES, "0199901")).toEqual([]);
  });

  it("keeps only the in-area subset of a mixed list", () => {
    const actions = toOfficialActions([
      { ...ROW, id: 1, zone_id: "zone-uno" },
      { ...ROW, id: 2, zone_id: "zone-other-town" },
      { ...ROW, id: 3, zone_id: null },
    ]);
    expect(filterToArea(actions, ZONES, "0199901").map((a) => a.id)).toEqual([1]);
  });
});

describe("historyScope", () => {
  it("opens on every area for an admin, whose area is the whole country (M1)", () => {
    expect(historyScope(undefined, "admin")).toBe("all");
  });

  it("opens on the official's own area otherwise", () => {
    expect(historyScope(undefined, "barangay")).toBe("mine");
    expect(historyScope(undefined, undefined)).toBe("mine");
  });

  it("honours an explicit choice either way", () => {
    expect(historyScope("mine", "admin")).toBe("mine");
    expect(historyScope("all", "municipality")).toBe("all");
    expect(historyScope("junk", "barangay")).toBe("mine");
  });
});
