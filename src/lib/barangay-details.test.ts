import { describe, it, expect } from "vitest";
import { hotlineProblem, instructionsProblem, telHref } from "./barangay-details";

describe("a barangay's hotline numbers", () => {
  it("dials only the digits and a leading plus", () => {
    expect(telHref("(075) 522-1234")).toBe("tel:0755221234");
    expect(telHref("+63 917 123 4567")).toBe("tel:+639171234567");
  });

  it("accepts a pasted number with spaces or a newline around it, and the +63 form", () => {
    expect(hotlineProblem(" 0917 123 4567\n")).toBeNull();
    expect(hotlineProblem("+63 917 123 4567")).toBeNull();
  });

  it("refuses letters, fewer than 3 digits, all zeros and over 20 characters", () => {
    for (const bad of ["abc", "1-2", "000 000", "1".repeat(21)]) expect(hotlineProblem(bad)).not.toBeNull();
  });
});

describe("a barangay's evacuation instructions", () => {
  it("needs instructions in one language, at most 1,000 characters", () => {
    expect(instructionsProblem({ en: "Go to the school.", fil: "" })).toBeNull();
    expect(instructionsProblem({ en: "", fil: "  " })).not.toBeNull();
    expect(instructionsProblem({ en: "x".repeat(1001), fil: "" })).not.toBeNull();
  });
});
