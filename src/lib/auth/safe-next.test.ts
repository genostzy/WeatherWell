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

  it("strips a TAB, LF or CR immediately after the leading slash before checking for //, rather than being fooled by a character the URL parser will later remove", () => {
    // The WHATWG URL parser strips TAB/LF/CR anywhere in the input before
    // parsing, so `new URL("/\t//evil.example", origin)` sees "//evil.example"
    // — an off-origin, protocol-relative URL — even though the raw string
    // here starts with "/" and not "//". A result of "//evil.example" would
    // mean the check missed this entirely; every case below must come back
    // either the fallback or a path that is unambiguously same-origin once
    // stripped.
    expect(safeNext("/\t//evil.example")).toBe("/");
    expect(safeNext("/\n//evil.example")).toBe("/");
    expect(safeNext("/\r//evil.example")).toBe("/");
  });

  it("strips a TAB, LF or CR embedded later in the path too, not just right after the leading slash", () => {
    expect(safeNext("/admin/\tzone")).toBe("/admin/zone");
    expect(safeNext("/admin/\nzone")).toBe("/admin/zone");
    expect(safeNext("/admin/\rzone")).toBe("/admin/zone");
  });

  it("strips the percent-decoded form of these characters as they would actually arrive from a query string", () => {
    // decodeURIComponent("%2F%09%2F%2Fevil.example") === "/\t//evil.example"
    // — this is the literal attack string from the query parameter.
    const decoded = decodeURIComponent("%2F%09%2F%2Fevil.example");
    expect(safeNext(decoded)).toBe("/");
    expect(safeNext(decoded)).not.toBe("//evil.example");
  });
});
