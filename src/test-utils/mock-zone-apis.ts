import { vi } from "vitest";
import { findNearestZone } from "@/lib/nearest-zone";

interface ZoneLike {
  id: string;
  name: string;
  municipalityName: string;
  provinceName: string;
  lat: number;
  lng: number;
}

/**
 * Stubs global.fetch for /api/zones/search and /api/zones/nearest, computed
 * against the given zones with the same functions the real routes use
 * (findNearestZone) — so a test's expectations are pinned to real behavior,
 * not hand-copied numbers that could silently drift from it.
 *
 * ZonePicker used to take a `zones` prop and compute both of these
 * client-side; it now resolves them from the network instead (so onboarding
 * never has to hold the full nationwide dataset — see ReferenceDataProvider's
 * own doc comment on why). This is what stands in for that network in tests.
 */
export function mockZoneApis(zones: readonly ZoneLike[]) {
  global.fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input), "https://weatherwell.test");

    if (url.pathname === "/api/zones/nearest") {
      // Posted, never in the address (privacy review).
      const { lat, lng } = JSON.parse(String(init?.body ?? "{}")) as { lat: number; lng: number };
      const match = findNearestZone({ lat, lng }, zones);
      return Promise.resolve(
        new Response(
          JSON.stringify(
            match
              ? {
                  zone: {
                    id: match.zone.id,
                    name: match.zone.name,
                    municipalityName: match.zone.municipalityName,
                    provinceName: match.zone.provinceName,
                    lat: match.zone.lat,
                    lng: match.zone.lng,
                  },
                  distanceMeters: match.distanceMeters,
                  isNear: match.isNear,
                }
              : { zone: null, distanceMeters: null, isNear: false }
          ),
          { status: 200 }
        )
      );
    }

    if (url.pathname === "/api/zones/search") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const matches = zones.filter((z) =>
        `${z.name} ${z.municipalityName} ${z.provinceName}`.toLowerCase().includes(q)
      );
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: matches.map((z) => ({
              id: z.id,
              name: z.name,
              municipality_name: z.municipalityName,
              province_name: z.provinceName,
              lat: z.lat,
              lng: z.lng,
            })),
            total: matches.length,
          }),
          { status: 200 }
        )
      );
    }

    return Promise.reject(new Error(`mockZoneApis: unexpected fetch to ${url.pathname}`));
  }) as unknown as typeof fetch;
}
