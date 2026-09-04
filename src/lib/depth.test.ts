import { describe, it, expect } from "vitest";
import {
  DEPTH_LEVELS,
  DEPTH_LABEL,
  DEPTH_CM,
  DEPTH_SEVERITY,
  depthFillPercent,
} from "./depth";

describe("depth", () => {
  it("orders depth levels from dry to neck", () => {
    expect(DEPTH_LEVELS).toEqual(["dry", "ankle", "knee", "waist", "neck"]);
  });

  it("labels every depth level in English", () => {
    expect(DEPTH_LABEL.dry.en).toBe("Dry");
    expect(DEPTH_LABEL.ankle.en).toBe("Ankle-deep");
    expect(DEPTH_LABEL.knee.en).toBe("Knee-deep");
    expect(DEPTH_LABEL.waist.en).toBe("Waist-deep");
    expect(DEPTH_LABEL.neck.en).toBe("Neck-deep");
  });

  it("labels every depth level in Filipino too — report copy is never a bare string", () => {
    expect(DEPTH_LABEL.dry.fil).toBe("Walang baha");
    expect(DEPTH_LABEL.ankle.fil).toBe("Hanggang bukong-bukong");
    expect(DEPTH_LABEL.knee.fil).toBe("Hanggang tuhod");
    expect(DEPTH_LABEL.waist.fil).toBe("Hanggang baywang");
    expect(DEPTH_LABEL.neck.fil).toBe("Hanggang leeg");
  });

  it("maps each depth level to a cm estimate matching the PRD scale", () => {
    expect(DEPTH_CM.dry).toBe(0);
    expect(DEPTH_CM.ankle).toBe(15);
    expect(DEPTH_CM.knee).toBe(45);
    expect(DEPTH_CM.waist).toBe(90);
    expect(DEPTH_CM.neck).toBe(150);
  });

  it("maps each depth level to a severity matching the PRD auto-trigger rule", () => {
    expect(DEPTH_SEVERITY.dry).toBe("yellow");
    expect(DEPTH_SEVERITY.ankle).toBe("orange");
    expect(DEPTH_SEVERITY.knee).toBe("red");
    expect(DEPTH_SEVERITY.waist).toBe("evacuate");
    expect(DEPTH_SEVERITY.neck).toBe("evacuate");
  });

  describe("depthFillPercent", () => {
    it("returns 0 for no water", () => {
      expect(depthFillPercent(0, 170)).toBe(0);
    });

    it("returns a proportional fill for a mid-range depth", () => {
      expect(depthFillPercent(85, 170)).toBe(50);
    });

    it("clamps at 100 when depth exceeds figure height", () => {
      expect(depthFillPercent(300, 170)).toBe(100);
    });

    it("never returns a negative value", () => {
      expect(depthFillPercent(-10, 170)).toBe(0);
    });

    it("submerges a child fully at a depth an adult is only partly in", () => {
      expect(depthFillPercent(150, 110)).toBe(100);
      expect(depthFillPercent(150, 170)).toBeLessThan(100);
    });
  });
});
