import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { setSelectedZoneId } from "@/features/onboarding/onboarding-storage";
import { ReferenceDataContext } from "@/lib/reference-data/provider";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => params }));

import { useViewedZone } from "./use-viewed-zone";

const zones = FIXTURE_REFERENCE_DATA.zones;

function wrapper({ children }: { children: ReactNode }) {
  return <ReferenceDataContext.Provider value={FIXTURE_REFERENCE_DATA}>{children}</ReferenceDataContext.Provider>;
}

function viewed(query: string) {
  params = new URLSearchParams(query);
  return renderHook(() => useViewedZone(), { wrapper });
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("weatherwell.selectedZoneId", zones[0].id);
});

describe("useViewedZone (?zone= on / and /evacuation)", () => {
  it("is nothing without ?zone=, for an unknown one, or for my own barangay", () => {
    expect(viewed("").result.current).toBeNull();
    expect(viewed("zone=nope").result.current).toBeNull();
    expect(viewed(`zone=${zones[0].id}`).result.current).toBeNull();
  });

  it("is the barangay named in ?zone=", () => {
    expect(viewed(`zone=${zones[1].id}`).result.current?.id).toBe(zones[1].id);
  });

  it("stops viewing once the viewed barangay becomes mine", () => {
    const { result } = viewed(`zone=${zones[1].id}`);
    expect(result.current?.id).toBe(zones[1].id);
    act(() => {
      setSelectedZoneId(zones[1].id);
    });
    expect(result.current).toBeNull();
  });
});
