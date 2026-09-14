import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { OfficialProvider, useOfficial } from "./official-context";
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
