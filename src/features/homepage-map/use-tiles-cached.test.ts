import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsOnline } from "./use-tiles-cached";

describe("useIsOnline", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("reflects navigator.onLine", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(false);
  });

  it("is true when online", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);
  });
});
