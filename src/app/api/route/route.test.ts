import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { POST as RoutePost } from "./route";

const fetchMock = vi.fn();
const start = new Date("2026-09-29T12:00:00Z").getTime();
let POST: typeof RoutePost;

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(start);
  // The limits count inside the module, so every test starts from a fresh copy.
  vi.resetModules();
  ({ POST } = await import("./route"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A request from one caller; `ip` sends it from another address. */
const post = (body: unknown, ip = "203.0.113.7") =>
  POST(new Request("https://x/api/route", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify(body) }));

const from: [number, number] = [16.0288, 120.4366];
const to: [number, number] = [16.03, 120.44];

/** A route as the router writes it: GeoJSON [lng, lat] points. */
const routerRoute = (coordinates: [number, number][], distance: number, duration: number) => ({
  geometry: { type: "LineString", coordinates },
  distance,
  duration,
});

/** The router answering with one route. */
const answered = () => ({
  ok: true,
  json: async () => ({ code: "Ok", routes: [routerRoute([[120.4366, 16.0288], [120.44, 16.03]], 500, 400)] }),
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

  it("asks the router at most 10 times in 10 seconds for everyone together, and answers 429 past that (FOSSGIS allows one a second)", async () => {
    fetchMock.mockResolvedValue(answered());
    for (let i = 0; i < 10; i++) expect((await post({ from, to }, `203.0.113.${i}`)).status).toBe(200);

    expect((await post({ from, to }, "198.51.100.1")).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(10);

    vi.setSystemTime(start + 9_999);
    expect((await post({ from, to }, "198.51.100.1")).status).toBe(429);

    vi.setSystemTime(start + 10_000);
    expect((await post({ from, to }, "198.51.100.1")).status).toBe(200);
  });

  it("answers 429 to one caller's 21st request in a minute, so one address can't spend the router's budget", async () => {
    fetchMock.mockResolvedValue(answered());
    for (let i = 0; i < 20; i++) {
      vi.setSystemTime(start + i * 1_000);
      expect((await post({ from, to })).status).toBe(200);
    }

    vi.setSystemTime(start + 59_999);
    expect((await post({ from, to })).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect((await post({ from, to }, "198.51.100.1")).status).toBe(200);

    vi.setSystemTime(start + 60_000);
    expect((await post({ from, to })).status).toBe(200);
  });

  it("spends none of the router's budget on a request it refuses as malformed", async () => {
    for (let i = 0; i < 10; i++) expect((await post({ from }, `203.0.113.${i}`)).status).toBe(400);
    fetchMock.mockResolvedValue(answered());

    expect((await post({ from, to }, "198.51.100.1")).status).toBe(200);
  });
});
