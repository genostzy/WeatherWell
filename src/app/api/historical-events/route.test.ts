import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ORIGIN = "https://weatherwell.app";

/** A thenable, chainable stand-in for Supabase's PostgrestFilterBuilder — matches the pattern in api/zones/nearest/route.test.ts. */
function makeBuilder(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    in: () => builder,
    order: () => builder,
    returns: () => Promise.resolve(result),
  };
  return builder;
}

const EVENT_ROW = {
  id: "event-1",
  zone_id: "zone-1",
  hazard_type: "flood",
  event_date: "2024-09-15",
  severity: "red",
  description: { en: "Knee-deep flooding along the main road.", fil: "Baha hanggang tuhod sa main road." },
  source: "Barangay records",
};

const from = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from }),
}));

import { GET } from "./route";

function request(qs: string): NextRequest {
  return new NextRequest(`${ORIGIN}/api/historical-events${qs}`);
}

describe("GET /api/historical-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty list without querying when no zoneIds are given", async () => {
    const response = await GET(request(""));
    const body = await response.json();

    expect(body).toEqual({ events: [] });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns an empty list for an all-empty zoneIds param", async () => {
    const response = await GET(request("?zoneIds=,,"));
    const body = await response.json();

    expect(body).toEqual({ events: [] });
    expect(from).not.toHaveBeenCalled();
  });

  it("maps rows to camelCase, scoped to the requested zones", async () => {
    from.mockReturnValue(makeBuilder({ data: [EVENT_ROW], error: null }));

    const response = await GET(request("?zoneIds=zone-1,zone-2"));
    const body = await response.json();

    expect(from).toHaveBeenCalledWith("historical_events");
    expect(body.events).toEqual([
      {
        id: "event-1",
        zoneId: "zone-1",
        hazardType: "flood",
        eventDate: "2024-09-15",
        severity: "red",
        description: EVENT_ROW.description,
        source: "Barangay records",
      },
    ]);
  });

  it("reports a query error instead of a false empty result", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: { message: "connection refused" } }));

    const response = await GET(request("?zoneIds=zone-1"));

    expect(response.status).toBe(502);
  });

  it("caps the zoneIds list rather than passing an unbounded query", async () => {
    const many = Array.from({ length: 600 }, (_, i) => `zone-${i}`).join(",");

    const inSpy = vi.fn((_column: string, ids: string[]) => ({
      order: () => ({ returns: () => Promise.resolve({ data: [], error: null }) }),
    }));
    from.mockReturnValue({ select: () => ({ in: inSpy }) });

    await GET(request(`?zoneIds=${many}`));

    expect(inSpy).toHaveBeenCalledWith("zone_id", expect.arrayContaining(["zone-0"]));
    expect(inSpy.mock.calls[0][1].length).toBe(500);
  });

  it("sends no-store, since this must never come from a shared cache stale", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));

    const response = await GET(request("?zoneIds=zone-1"));

    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
