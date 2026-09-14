import { describe, it, expect } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps a same-origin path", () => {
    expect(safeNext("/admin/zone/zone-1?x=1")).toBe("/admin/zone/zone-1?x=1");
  });
  it("refuses another origin, a protocol-relative URL and backslash tricks", () => {
    expect(safeNext("https://evil.example/admin")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
  });
  it("falls back when missing", () => {
    expect(safeNext(null, "/admin")).toBe("/admin");
  });
});
