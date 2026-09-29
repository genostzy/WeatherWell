import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const post = (body: unknown) => POST(new Request("https://x/api/route", { method: "POST", body: JSON.stringify(body) }));

const from: [number, number] = [16.0288, 120.4366];
const to: [number, number] = [16.03, 120.44];

/** A route as the router writes it: GeoJSON [lng, lat] points. */
const routerRoute = (coordinates: [number, number][], distance: number, duration: number) => ({
  geometry: { type: "LineString", coordinates },
  distance,
  duration,
});

describe("POST /api/route", () => {
  it("has no GET, so a position never sits in an address that logs and history keep (privacy review)", async () => {
    expect(await import("./route")).not.toHaveProperty("GET");
  });

  it("asks the walking router for alternatives, with the app's name", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ code: "Ok", routes: [routerRoute([[120.4366, 16.0288], [120.44, 16.03]], 500, 400)] }),
    });

    await post({ from, to });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url).startsWith("https://routing.openstreetmap.de/routed-foot/route/v1/foot/120.4366,16.0288;120.44,16.03?")).toBe(true);
    expect(String(url)).toContain("alternatives=3");
    expect(init.headers["User-Agent"]).toContain("WeatherWell");
  });

  it("gives the router 8 seconds", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: "Ok", routes: [] }) });

    await post({ from, to });

    expect(timeout).toHaveBeenCalledWith(8000);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("returns every alternative, as [lat, lng] points", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [
          routerRoute([[120.4366, 16.0288], [120.438, 16.029], [120.44, 16.03]], 1500.4, 1080.2),
          routerRoute([[120.4366, 16.0288], [120.441, 16.028], [120.44, 16.03]], 1900.6, 1400.7),
        ],
      }),
    });

    const res = await post({ from, to });

    expect(await res.json()).toEqual({
      routes: [
        { polyline: [[16.0288, 120.4366], [16.029, 120.438], [16.03, 120.44]], distanceMeters: 1500, durationSeconds: 1080 },
        { polyline: [[16.0288, 120.4366], [16.028, 120.441], [16.03, 120.44]], distanceMeters: 1901, durationSeconds: 1401 },
      ],
      fallback: false,
    });
  });

  it("falls back to a straight line, marked, when the router fails or is slow", async () => {
    fetchMock.mockRejectedValue(new Error("timed out"));

    const res = await post({ from, to });

    expect(await res.json()).toEqual({
      routes: [{ polyline: [from, to], distanceMeters: null, durationSeconds: null }],
      fallback: true,
    });
  });

  it("falls back the same way when the router answers with an error, or with no route", async () => {
    const straight = { routes: [{ polyline: [from, to], distanceMeters: null, durationSeconds: null }], fallback: true };

    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    expect(await (await post({ from, to })).json()).toEqual(straight);

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: "NoRoute", routes: [] }) });
    expect(await (await post({ from, to })).json()).toEqual(straight);

    // A route with no usable line is no route.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: "Ok", routes: [{ geometry: {}, distance: 1, duration: 1 }] }) });
    expect(await (await post({ from, to })).json()).toEqual(straight);
  });

  it("refuses a missing or non-numeric point", async () => {
    expect((await post({ from: [16.02, 120.45] })).status).toBe(400);
    expect((await post({ from: ["16.02", 120.45], to: [16.03, 120.46] })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
  });
});
