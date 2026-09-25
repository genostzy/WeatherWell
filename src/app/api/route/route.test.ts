import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const post = (body: unknown) => POST(new Request("https://x/api/route", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/route", () => {
  it("has no GET, so a position never sits in an address that logs and history keep (privacy review)", async () => {
    expect(await import("./route")).not.toHaveProperty("GET");
  });

  it("asks OSRM for the road route between the two posted points", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{ geometry: { type: "LineString", coordinates: [[120.45, 16.02], [120.46, 16.03]] }, distance: 1500.4, duration: 300.2 }],
      }),
    });

    const res = await post({ from: [16.02, 120.45], to: [16.03, 120.46] });

    expect(String(fetchMock.mock.calls[0][0])).toContain("/route/v1/driving/120.45,16.02;120.46,16.03");
    expect(await res.json()).toEqual({ polyline: [[16.02, 120.45], [16.03, 120.46]], distanceMeters: 1500, durationSeconds: 300 });
  });

  it("refuses a missing or non-numeric point", async () => {
    expect((await post({ from: [16.02, 120.45] })).status).toBe(400);
    expect((await post({ from: ["16.02", 120.45], to: [16.03, 120.46] })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
  });
});
