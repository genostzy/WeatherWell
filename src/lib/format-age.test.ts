import { describe, it, expect } from "vitest";
import { formatAge } from "./format-age";

describe("formatAge (found checking the officials screen: '2737 min ago')", () => {
  it("counts minutes for the first hour, hours for two days, then days", () => {
    expect(formatAge(0, "en")).toBe("just now");
    expect(formatAge(8, "en")).toBe("8 min ago");
    expect(formatAge(59, "en")).toBe("59 min ago");
    expect(formatAge(60, "en")).toBe("1 h ago");
    expect(formatAge(47 * 60 + 59, "en")).toBe("47 h ago");
    expect(formatAge(2737, "en")).toBe("45 h ago");
    expect(formatAge(48 * 60, "en")).toBe("2 days ago");
    expect(formatAge(10316, "en")).toBe("7 days ago");
  });

  it("speaks Filipino", () => {
    expect(formatAge(0, "fil")).toBe("ngayon lang");
    expect(formatAge(8, "fil")).toBe("8 min ang nakaraan");
    expect(formatAge(120, "fil")).toBe("2 oras ang nakaraan");
    expect(formatAge(10316, "fil")).toBe("7 araw ang nakaraan");
  });
});
