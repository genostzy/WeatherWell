import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReferenceDataProvider } from "./provider";
import { useZones, usePois, useHazardsForZone } from "./use-reference-data";
import { LanguageProvider } from "@/features/i18n/language-provider";

function ZoneNames() {
  const zones = useZones();
  return <ul>{zones.map((z) => <li key={z.id}>{z.name}</li>)}</ul>;
}

function PoiNames() {
  const pois = usePois();
  return <ul>{pois.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}

function HazardLevels({ zoneId }: { zoneId: string }) {
  const hazards = useHazardsForZone(zoneId);
  return <span data-testid="hazards">{JSON.stringify(hazards)}</span>;
}

const ONE_ZONE = {
  zones: [{ id: "zone-1", name: "Barangay Nilombot, Mapandan" }],
  pois: [],
  hazards: {},
};

const ZONE_WITH_POIS_AND_HAZARDS = {
  zones: [{ id: "zone-1", name: "Barangay Nilombot, Mapandan" }],
  pois: [{ id: "poi-1", zoneId: "zone-1", category: "health_center", name: "Mapandan District Health Center", lat: 0, lng: 0 }],
  hazards: { "zone-1": { flood: "high" } },
};

function renderProvider() {
  render(
    <LanguageProvider>
      <ReferenceDataProvider>
        <ZoneNames />
      </ReferenceDataProvider>
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReferenceDataProvider", () => {
  it("does not render children until the data is in hand", () => {
    // The whole design rests on this: consumers may assume zones exist.
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderProvider();
    expect(screen.queryByText("Barangay Nilombot, Mapandan")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders children once the data arrives", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ONE_ZONE,
    });
    renderProvider();
    expect(await screen.findByText("Barangay Nilombot, Mapandan")).toBeInTheDocument();
  });

  it("tells the resident it cannot reach the data instead of spinning forever", async () => {
    // A device that is offline AND has never cached /api/zones. An indefinite
    // spinner during a flood is the worst possible answer.
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/offline|connection|reach/i);
  });

  it("treats a non-ok response as a failure, not as empty data", async () => {
    // A 502 that produced an empty zone list would read as "no zones alerting".
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("offers a way to retry, since the network may come back", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });
});

describe("useZones outside a provider", () => {
  it("throws a directive error rather than returning an empty array", () => {
    // Silently returning [] is how "no zones" becomes indistinguishable from
    // "no alerts anywhere". Fail at the developer, not at the resident.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ZoneNames />)).toThrow(/ReferenceDataProvider/);
    quiet.mockRestore();
  });
});

describe("usePois", () => {
  it("exposes the points of interest from the fetched reference data", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ZONE_WITH_POIS_AND_HAZARDS,
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <PoiNames />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    expect(await screen.findByText("Mapandan District Health Center")).toBeInTheDocument();
  });
});

describe("useHazardsForZone", () => {
  it("returns the hazard levels for a known zone", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ZONE_WITH_POIS_AND_HAZARDS,
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <HazardLevels zoneId="zone-1" />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("hazards").textContent).toBe(JSON.stringify({ flood: "high" }))
    );
  });

  it("falls back to an empty record for an unknown zone rather than throwing", async () => {
    // The `?? {}` fallback in useHazardsForZone: an unwired or mistyped zone
    // id must render as "no hazard data", not crash the page.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ZONE_WITH_POIS_AND_HAZARDS,
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <HazardLevels zoneId="zone-does-not-exist" />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    await waitFor(() => expect(screen.getByTestId("hazards").textContent).toBe(JSON.stringify({})));
  });
});
