import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { ReferenceDataProvider, FETCH_TIMEOUT_MS } from "./provider";
import { useZones, usePois, useHazardsForZone } from "./use-reference-data";
import { useAlerts } from "@/lib/alerts-store";
import { LanguageProvider } from "@/features/i18n/language-provider";
import type { AlertRecord } from "@/lib/types";

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

function AlertIds() {
  const alerts = useAlerts();
  return <span data-testid="alert-ids">{alerts.map((a) => a.id).join(",")}</span>;
}

const ALERT: AlertRecord = {
  id: "alert-1",
  zoneId: "zone-1",
  severity: "red",
  message: { en: "Knee-deep flooding reported.", fil: "May baha hanggang tuhod." },
  source: "manual",
  confidence: "validated",
  issuedAt: "2026-09-07T02:00:00.000Z",
  isActive: true,
};

/** A fetch mock that mimics real fetch: never settles until its AbortSignal fires. */
function hangingFetch(url: string, options?: { signal?: AbortSignal }) {
  return new Promise<never>((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    });
  });
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
    // A device that is offline AND has never cached /data/reference-data.json. An indefinite
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

  it("shows the failure card when zones succeed but alerts answer non-ok (I7)", async () => {
    // The exact mixed state the gate exists for: a page showing every zone
    // with no alert data reads as "every barangay is safe", so this must not
    // silently fall through to "ready".
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/data/reference-data.json") return Promise.resolve({ ok: true, json: async () => ONE_ZONE });
      return Promise.resolve({ ok: false, status: 502, json: async () => ({}) });
    });
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Barangay Nilombot, Mapandan")).not.toBeInTheDocument();
  });

  it("shows the failure card when zones succeed but the alerts fetch rejects (I7)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/data/reference-data.json") return Promise.resolve({ ok: true, json: async () => ONE_ZONE });
      return Promise.reject(new TypeError("Failed to fetch"));
    });
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Barangay Nilombot, Mapandan")).not.toBeInTheDocument();
  });

  it("passes the fetched alerts through to children rather than an empty array (I7)", async () => {
    // Changing the provider to pass alerts: [] must fail this test — it did
    // not fail any test before this one existed.
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/data/reference-data.json") return Promise.resolve({ ok: true, json: async () => ONE_ZONE });
      return Promise.resolve({ ok: true, json: async () => [ALERT] });
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <AlertIds />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    expect(await screen.findByTestId("alert-ids")).toHaveTextContent(ALERT.id);
  });

  it("reaches the failure card rather than hanging forever when a fetch never settles (C2)", async () => {
    vi.useFakeTimers();
    try {
      (fetch as ReturnType<typeof vi.fn>).mockImplementation(hangingFetch);
      renderProvider();
      expect(screen.getByRole("status")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
      });

      expect(screen.getByRole("alert")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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

describe("ReferenceDataProvider's chrome prop (fix round 1, finding 5)", () => {
  function renderWithChrome(childUi = <ZoneNames />) {
    return render(
      <LanguageProvider>
        <ReferenceDataProvider chrome={<div data-testid="chrome">chrome content</div>}>
          {childUi}
        </ReferenceDataProvider>
      </LanguageProvider>
    );
  }

  it("renders chrome while data is loading, alongside the loading status", () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderWithChrome();
    expect(screen.getByTestId("chrome")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders chrome after a load failure, alongside the failure card", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithChrome();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByTestId("chrome")).toBeInTheDocument();
  });

  it("renders chrome once data is ready, alongside the real children", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ONE_ZONE,
    });
    renderWithChrome();
    expect(await screen.findByText("Barangay Nilombot, Mapandan")).toBeInTheDocument();
    expect(screen.getByTestId("chrome")).toBeInTheDocument();
  });

  it("renders nothing extra when chrome is omitted, leaving every existing call site unchanged", () => {
    // Guards the "existing assertions stay unchanged" rule: a provider with
    // no `chrome` prop (every call site before this fix round) must behave
    // exactly as it did — this is the same render `renderProvider()` above
    // uses, just spelled out here to keep the point next to the new tests.
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderProvider();
    expect(screen.queryByTestId("chrome")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
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
    // The fixture rates flood only; the types it does not rate read
    // "unknown" rather than being absent (I3).
    await waitFor(() =>
      expect(screen.getByTestId("hazards").textContent).toBe(
        JSON.stringify({ flood: "high", landslide: "unknown", storm_surge: "unknown", dam_release: "unknown" })
      )
    );
  });

  it("falls back to an all-unknown record for an unknown zone rather than throwing", async () => {
    // An unwired or mistyped zone id, or a barangay with no hazard rows, must
    // render as "no hazard data", not crash the page. It used to fall back to
    // an empty record, which every reader then dereferenced into undefined
    // and crashed on (I3); every type now reads "unknown".
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
    await waitFor(() =>
      expect(screen.getByTestId("hazards").textContent).toBe(
        JSON.stringify({ flood: "unknown", landslide: "unknown", storm_surge: "unknown", dam_release: "unknown" })
      )
    );
  });
});
