import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { dispatchLiveChange, useLiveChange } from "./live-changes";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useLiveChange", () => {
  it("calls back once for a burst of matching changes, and ignores the rest", () => {
    const onChange = vi.fn();
    renderHook(() => useLiveChange((change) => change.kind === "report" && change.zone_id === "zone-1", onChange));

    dispatchLiveChange({ kind: "report", zone_id: "zone-1", town_code: null });
    dispatchLiveChange({ kind: "report", zone_id: "zone-1", town_code: null });
    dispatchLiveChange({ kind: "alert", zone_id: "zone-1", town_code: null });
    dispatchLiveChange({ kind: "report", zone_id: "zone-2", town_code: null });
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenCalledTimes(1);

    dispatchLiveChange({ kind: "report", zone_id: "zone-1", town_code: null });
    vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("stops listening once the screen is gone", () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() => useLiveChange(() => true, onChange));
    unmount();
    dispatchLiveChange({ kind: "alert", zone_id: "zone-1", town_code: null });
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
  });
});
