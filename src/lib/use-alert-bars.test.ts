import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAlertBars } from "./use-alert-bars";

afterEach(() => vi.unstubAllGlobals());

describe("useAlertBars (Stage 4 calibration)", () => {
  it("gives each barangay its own bar once the raised ones arrive", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ "zone-1": 1 }) }));
    const { result } = renderHook(() => useAlertBars());

    expect(result.current("zone-1")).toEqual({ reporters: 3, trust: 1 });
    await waitFor(() => expect(result.current("zone-1")).toEqual({ reporters: 4, trust: 1.25 }));
    expect(result.current("zone-2")).toEqual({ reporters: 3, trust: 1 });
  });

  it("keeps today's bar when the raised ones can't be fetched (offline)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAlertBars());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current("zone-1")).toEqual({ reporters: 3, trust: 1 });
  });
});
