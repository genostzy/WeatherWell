import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useHistoricalEvents } from "./historical-events";

const EVENT: import("./types").HistoricalEvent = {
  id: "event-1",
  zoneId: "zone-1",
  hazardType: "flood",
  eventDate: "2024-09-15",
  severity: "red",
  description: { en: "Knee-deep flooding.", fil: "Baha hanggang tuhod." },
  source: "Barangay records",
};

describe("useHistoricalEvents", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fetches nothing and returns an empty array for no zones", () => {
    const { result } = renderHook(() => useHistoricalEvents([]));

    expect(result.current).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches scoped to the given zone ids and returns the events", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ events: [EVENT] }),
    });

    const { result } = renderHook(() => useHistoricalEvents(["zone-1", "zone-2"]));

    await waitFor(() => expect(result.current).toEqual([EVENT]));
    expect(fetch).toHaveBeenCalledWith("/api/historical-events?zoneIds=zone-1%2Czone-2");
  });

  it("resolves to an empty array on a non-ok response, not a thrown error", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 502 });

    const { result } = renderHook(() => useHistoricalEvents(["zone-1"]));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it("resolves to an empty array when the fetch itself rejects", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useHistoricalEvents(["zone-1"]));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it("refetches when the zone list changes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ events: [EVENT] }),
    });

    const { rerender } = renderHook(({ zoneIds }) => useHistoricalEvents(zoneIds), {
      initialProps: { zoneIds: ["zone-1"] },
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    rerender({ zoneIds: ["zone-1", "zone-3"] });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenLastCalledWith("/api/historical-events?zoneIds=zone-1%2Czone-3");
  });

  it("does not refetch when the zone list is the same values on a fresh render", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] }),
    });

    const { rerender } = renderHook(({ zoneIds }) => useHistoricalEvents(zoneIds), {
      initialProps: { zoneIds: ["zone-1", "zone-2"] },
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    // A fresh array with the same ids — e.g. a parent's viewport-culled list recomputing.
    rerender({ zoneIds: ["zone-1", "zone-2"] });

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
