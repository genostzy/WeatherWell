import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTyphoon } from "./use-typhoon";

afterEach(() => vi.unstubAllGlobals());

describe("useTyphoon (found testing the live site)", () => {
  it("fetches once during an active storm instead of re-fetching on every new track object", async () => {
    // Each reply is a fresh object, exactly as res.json() gives in the browser.
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ track: { id: "t1", name: "QUEENIE" } }) }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTyphoon());
    await waitFor(() => expect(result.current.track).not.toBeNull());
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
