import { describe, it, expect } from "vitest";
import { PIN_KIND_ORDER, PIN_STATUS_COLOR, PIN_STATUS_LABEL, PIN_STATUS_ORDER, pinKindOf } from "./community-pin";

describe("pin types", () => {
  it("sorts every tag into its kind", () => {
    expect(pinKindOf("rising")).toBe("flood");
    expect(pinKindOf("impassable")).toBe("flood");
    expect(pinKindOf("road_blocked")).toBe("road_blocked");
    expect(pinKindOf("power_line_down")).toBe("power_line_down");
    expect(PIN_KIND_ORDER).toEqual(["flood", "road_blocked", "landslide", "power_line_down", "other"]);
  });

  it("labels every tag in both languages, with a colour", () => {
    expect(PIN_STATUS_ORDER).toHaveLength(8);
    for (const tag of PIN_STATUS_ORDER) {
      expect(PIN_STATUS_LABEL[tag].en).not.toBe("");
      expect(PIN_STATUS_LABEL[tag].fil).not.toBe("");
      expect(PIN_STATUS_COLOR[tag]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
