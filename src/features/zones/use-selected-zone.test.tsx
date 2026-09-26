import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useSelectedZone } from "./use-selected-zone";
import { setSelectedZoneId } from "@/features/onboarding/onboarding-storage";
import { ReferenceDataContext } from "@/lib/reference-data/provider";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const zones = FIXTURE_REFERENCE_DATA.zones;
const KEY = "weatherwell.selectedZoneId";

function wrapper({ children }: { children: ReactNode }) {
  return <ReferenceDataContext.Provider value={FIXTURE_REFERENCE_DATA}>{children}</ReferenceDataContext.Provider>;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("useSelectedZone (my barangay changes live)", () => {
  it("follows a change of barangay made in this tab", () => {
    window.localStorage.setItem(KEY, zones[0].id);
    const { result } = renderHook(() => useSelectedZone(), { wrapper });
    expect(result.current.id).toBe(zones[0].id);

    act(() => {
      setSelectedZoneId(zones[1].id);
    });
    expect(result.current.id).toBe(zones[1].id);
  });

  it("follows a change made in another tab", () => {
    window.localStorage.setItem(KEY, zones[0].id);
    const { result } = renderHook(() => useSelectedZone(), { wrapper });

    act(() => {
      window.localStorage.setItem(KEY, zones[1].id);
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    expect(result.current.id).toBe(zones[1].id);
  });

  it("still reads a barangay saved as a plain id before this change", () => {
    window.localStorage.setItem(KEY, zones[1].id);
    const { result } = renderHook(() => useSelectedZone(), { wrapper });
    expect(result.current.id).toBe(zones[1].id);
  });
});
