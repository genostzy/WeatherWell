import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { OfficialProvider, useOfficial, useManagesZone } from "./official-context";
import type { Official } from "./official";

const OFFICIAL: Official = {
  userId: "official-1",
  displayName: "Juana Dela Cruz",
  areaCode: "1234567890",
  areaName: "Barangay Uno",
  level: "barangay",
};

function withOfficial(official: Official) {
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <OfficialProvider official={official}>{children}</OfficialProvider>
    ),
  };
}

describe("useOfficial", () => {
  it("returns the official supplied by OfficialProvider", () => {
    const { result } = renderHook(() => useOfficial(), withOfficial(OFFICIAL));
    expect(result.current).toEqual(OFFICIAL);
  });

  it("throws a directive error without an OfficialProvider ancestor", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useOfficial())).toThrow(/OfficialProvider/);
    quiet.mockRestore();
  });
});

describe("useManagesZone", () => {
  it("says yes for the official's own barangay and no for a neighbour in the same town", () => {
    const official: Official = { ...OFFICIAL, areaCode: "0105528012", level: "barangay" };
    const { result } = renderHook(() => useManagesZone(), withOfficial(official));
    expect(result.current({ psgcBarangayCode: "0105528012" })).toBe(true);
    expect(result.current({ psgcBarangayCode: "0105528099" })).toBe(false);
  });

  it("says yes for every barangay in a municipal official's town", () => {
    const official: Official = { ...OFFICIAL, areaCode: "0105528", level: "municipality" };
    const { result } = renderHook(() => useManagesZone(), withOfficial(official));
    expect(result.current({ psgcBarangayCode: "0105528012" })).toBe(true);
    expect(result.current({ psgcBarangayCode: "0105528099" })).toBe(true);
    expect(result.current({ psgcBarangayCode: "0105526000" })).toBe(false);
  });
});
