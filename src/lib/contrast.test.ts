import { describe, it, expect } from "vitest";
import { contrastRatio } from "./contrast";
import { SEVERITY_ORDER, SEVERITY_HEX, SEVERITY_TEXT_HEX } from "./severity";

describe("contrastRatio", () => {
  it("gives 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("gives 1 for a color against itself", () => {
    expect(contrastRatio("#dc2626", "#dc2626")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#eab308", "#000000")).toBeCloseTo(
      contrastRatio("#000000", "#eab308"),
      5
    );
  });
});

describe("severity palette accessibility", () => {
  it.each(SEVERITY_ORDER)(
    "%s badge meets WCAG AA (>= 4.5:1) against its text color",
    (severity) => {
      const ratio = contrastRatio(SEVERITY_HEX[severity], SEVERITY_TEXT_HEX[severity]);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  );
});
