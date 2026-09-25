import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ORIGIN = "https://weatherwell.app";

/** A thenable, chainable stand-in for Supabase's PostgrestFilterBuilder — matches the pattern in api/health/route.test.ts. */
function makeBuilder(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    gte: () => builder,
    lte: () => builder,
    returns: () => Promise.resolve(result),
  };
  return builder;
}

const NILOMBOT = { id: "zone-1", name: "Barangay Nilombot, Mapandan", municipality_name: "Mapandan", province_name: "Pangasinan", lat: 16.0288, lng: 120.4366 };
const MANGALDAN = { id: "zone-2", name: "Barangay Poblacion, Mangaldan", municipality_name: "Mangaldan", province_name: "Pangasinan", lat: 16.0703, lng: 120.4038 };

const from = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from }),
}));

import { POST } from "./route";

/** The old query strings, sent the way the route now takes them: in a POST body (privacy review). */
function bodyOf(qs: string): string {
  const pairs = [...new URLSearchParams(qs)].map(([key, value]) => [key, Number.isFinite(Number(value)) ? Number(value) : value]);
  return JSON.stringify(Object.fromEntries(pairs));
}

function request(qs: string): NextRequest {
  return new NextRequest(`${ORIGIN}/api/zones/nearest`, { method: "POST", body: bodyOf(qs) });
}

describe("POST /api/zones/nearest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has no GET, so a position never sits in an address that logs and history keep (privacy review)", async () => {
    expect(await import("./route")).not.toHaveProperty("GET");
  });

  it("rejects a request missing lat or lng", async () => {
    const response = await POST(request("?lat=16.08"));

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects non-numeric coordinates", async () => {
    const response = await POST(request("?lat=abc&lng=120"));

    expect(response.status).toBe(400);
  });

  it("picks the closer of two candidates within the bounding box, not the first row", async () => {
    // ~1.1km from Mangaldan, further from Nilombot — matches
    // zone-picker.test.tsx's own fixed-point expectation for this position.
    from.mockReturnValue(makeBuilder({ data: [NILOMBOT, MANGALDAN], error: null }));

    const response = await POST(request("?lat=16.08&lng=120.4038"));
    const body = await response.json();

    expect(body.zone.id).toBe("zone-2");
    expect(body.distanceMeters).toBeGreaterThan(1000);
    expect(body.distanceMeters).toBeLessThan(1200);
    expect(body.isNear).toBe(true);
  });

  it("reports isNear false beyond NEAR_ZONE_METERS", async () => {
    from.mockReturnValue(makeBuilder({ data: [NILOMBOT], error: null }));

    // Manila — tens of km from Pangasinan.
    const response = await POST(request("?lat=14.5995&lng=120.9842"));
    const body = await response.json();

    expect(body.zone.id).toBe("zone-1");
    expect(body.isNear).toBe(false);
  });

  it("falls back to an unfiltered scan when the bounding box matches nothing", async () => {
    // First call (bounded) returns empty, second (fallback) returns a zone —
    // this is the case a position far from any covered barangay hits.
    from
      .mockReturnValueOnce(makeBuilder({ data: [], error: null }))
      .mockReturnValueOnce(makeBuilder({ data: [NILOMBOT], error: null }));

    const response = await POST(request("?lat=7.19&lng=125.45"));
    const body = await response.json();

    expect(from).toHaveBeenCalledTimes(2);
    expect(body.zone.id).toBe("zone-1");
    expect(body.isNear).toBe(false);
  });

  it("returns a null zone rather than an error when there are no zones at all", async () => {
    from
      .mockReturnValueOnce(makeBuilder({ data: [], error: null }))
      .mockReturnValueOnce(makeBuilder({ data: [], error: null }));

    const response = await POST(request("?lat=16.08&lng=120.4038"));
    const body = await response.json();

    expect(body).toEqual({ zone: null, distanceMeters: null, isNear: false });
  });

  it("reports a query error instead of a false result", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: { message: "connection refused" } }));

    const response = await POST(request("?lat=16.08&lng=120.4038"));

    expect(response.status).toBe(502);
  });
});
