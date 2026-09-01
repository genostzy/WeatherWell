import { describe, it, expect } from "vitest";
import {
  SEVERITY_ORDER,
  SEVERITY_LABEL,
  SEVERITY_BADGE_CLASS,
  SEVERITY_HEX,
  SEVERITY_TEXT_HEX,
} from "./severity";

describe("severity", () => {
  it("orders severities from least to most urgent", () => {
    expect(SEVERITY_ORDER).toEqual(["yellow", "orange", "red", "evacuate"]);
  });

  it("labels every severity", () => {
    expect(SEVERITY_LABEL.yellow).toBe("Advisory");
    expect(SEVERITY_LABEL.orange).toBe("Watch");
    expect(SEVERITY_LABEL.red).toBe("Warning");
    expect(SEVERITY_LABEL.evacuate).toBe("Evacuate Now");
  });

  it("maps every severity to a badge class containing its color token", () => {
    expect(SEVERITY_BADGE_CLASS.yellow).toContain("bg-severity-yellow");
    expect(SEVERITY_BADGE_CLASS.orange).toContain("bg-severity-orange");
    expect(SEVERITY_BADGE_CLASS.red).toContain("bg-severity-red");
    expect(SEVERITY_BADGE_CLASS.evacuate).toContain("bg-severity-evacuate");
  });

  it("mirrors the CSS token hex values for every severity", () => {
    expect(SEVERITY_HEX).toEqual({
      yellow: "#eab308",
      orange: "#f97316",
      red: "#dc2626",
      evacuate: "#7f1d1d",
    });
  });

  it("pairs each severity with the text color used on top of it", () => {
    expect(SEVERITY_TEXT_HEX.yellow).toBe("#000000");
    expect(SEVERITY_TEXT_HEX.orange).toBe("#000000");
    expect(SEVERITY_TEXT_HEX.red).toBe("#ffffff");
    expect(SEVERITY_TEXT_HEX.evacuate).toBe("#ffffff");
  });
});
