import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The community-pin panel's outbox drain reaches the real Supabase browser
// client. Nothing here should sign anyone in.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));

// Both actions are "use server" modules reached only through a dynamic
// import inside the page's change handlers (see the comment above those
// handlers) — mocked here so rendering the page never touches them.
const setZoneAlertMock = vi.fn().mockResolvedValue({ ok: true });
const setCenterStatusMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/app/actions/set-zone-alert", () => ({
  setZoneAlert: (...args: unknown[]) => setZoneAlertMock(...args),
}));
vi.mock("@/app/actions/set-center", () => ({
  setCenterStatus: (...args: unknown[]) => setCenterStatusMock(...args),
}));

import ZoneDashboardPage from "./page";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { addCommunityPin } from "@/lib/community-pins";
import type { Official } from "@/lib/auth/official";
import { OfficialContext } from "@/lib/auth/official-context";
import { ReferenceDataProvider } from "@/lib/reference-data/provider";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AlertRecord } from "@/lib/types";

/**
 * The page reads its route param via React's `use(params)`, which suspends
 * on a plain pending promise until the Scheduler pings the root — a real
 * mechanism, but one that never fires in this jsdom test environment (no
 * task-queue driver `act()` can flush). Next.js itself sidesteps this for
 * already-known params by handing `use()` a thenable that already carries
 * `status: "fulfilled"` and `value`, which `use()` special-cases to return
 * synchronously without suspending at all. Same trick here.
 */
function resolvedParams<T>(value: T): Promise<T> {
  const thenable = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  thenable.status = "fulfilled";
  thenable.value = value;
  return thenable;
}

// The page never reads searchParams; a resolved-empty thenable via the same
// helper satisfies PageProps's required shape without adding behavior.
const emptySearchParams = resolvedParams({});

describe("ZoneDashboardPage capacity control", () => {
  it("disables the capacity select once a headcount is tracked, so the operator can't pick a status the headcount would immediately overrule", () => {
    const zone = { ...FIXTURE_REFERENCE_DATA.zones[0], currentOccupancy: 285 };
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, {
      data: { zones: [zone, ...FIXTURE_REFERENCE_DATA.zones.slice(1)] },
    });

    expect(screen.getByLabelText(/evacuation center capacity/i)).toBeDisabled();
    expect(screen.getByText(/entering a headcount derives the status automatically/i)).toBeInTheDocument();
  });

  it("leaves the capacity select enabled when no headcount is tracked", () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    expect(zone.currentOccupancy).toBeUndefined();
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />);

    expect(screen.getByLabelText(/evacuation center capacity/i)).toBeEnabled();
  });
});

describe("ZoneDashboardPage area scoping", () => {
  it("hides the alert and capacity controls, and says View only, for a zone outside the official's area", () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[1];
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: FIXTURE_REFERENCE_DATA.zones[0].psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, {
      official,
    });

    expect(screen.getByText(/view only — this barangay is outside your area/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/alert status/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/evacuation center capacity/i)).not.toBeInTheDocument();
  });

  it("shows the alert and capacity controls for a zone inside the official's area", () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: zone.psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, {
      official,
    });

    expect(screen.queryByText(/view only — this barangay is outside your area/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/evacuation center capacity/i)).toBeInTheDocument();
  });
});

describe("ZoneDashboardPage as a barangay official's home (found checking the live site)", () => {
  const zone = FIXTURE_REFERENCE_DATA.zones[0];
  const own: Official = { userId: "u1", displayName: "Kapitan", areaCode: zone.psgcBarangayCode, areaName: "Own", level: "barangay" };

  it("puts Needs your attention at the top for the barangay's own official, with no dead Back link", () => {
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, { official: own });
    expect(screen.getByText(/needs your attention/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^back to dashboard$/i })).not.toBeInTheDocument();
  });

  it("gives the barangay official the one-tap line to their town", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, { official: own });
    expect(screen.getByRole("button", { name: /our centre is full/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("leaves it off a barangay the official only views", () => {
    renderWithData(
      <ZoneDashboardPage params={resolvedParams({ zoneId: FIXTURE_REFERENCE_DATA.zones[1].id })} searchParams={emptySearchParams} />,
      { official: own }
    );
    expect(screen.queryByText(/needs your attention/i)).not.toBeInTheDocument();
  });

  it("keeps the Back link for a municipal official, whose home is the overview", () => {
    const municipal: Official = { ...own, level: "municipality", areaCode: zone.psgcBarangayCode.slice(0, 7) };
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, { official: municipal });
    expect(screen.getByRole("link", { name: /^back to dashboard$/i })).toBeInTheDocument();
    expect(screen.queryByText(/needs your attention/i)).not.toBeInTheDocument();
  });
});

describe("ZoneDashboardPage placeholders (found checking the live site)", () => {
  it("says there is no verified hotline or centre instead of printing the placeholders", () => {
    const zone = {
      ...FIXTURE_REFERENCE_DATA.zones[0],
      hotlineNumber: "00000000000",
      evacuationCenterName: "",
      evacuationCenterLat: FIXTURE_REFERENCE_DATA.zones[0].lat,
      evacuationCenterLng: FIXTURE_REFERENCE_DATA.zones[0].lng,
      evacuationCenterCapacity: 0,
    };
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, {
      data: { zones: [zone, ...FIXTURE_REFERENCE_DATA.zones.slice(1)] },
    });
    expect(screen.queryByText("00000000000")).not.toBeInTheDocument();
    expect(screen.getByText(/no verified hotline/i)).toBeInTheDocument();
    expect(screen.getByText(/no verified evacuation centre yet/i)).toBeInTheDocument();
  });
});

describe("ZoneDashboardPage community pin moderation gating (F6-1)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides Remove on the zone page's own pin panel when the zone is outside the official's area", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[1];
    addCommunityPin({ zoneId: zone.id, statusTag: "flooded", caption: "Outside-area pin", lat: 0, lng: 0 });
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: FIXTURE_REFERENCE_DATA.zones[0].psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };

    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, {
      official,
    });

    expect(await screen.findByText("Outside-area pin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove — flooded/i })).not.toBeInTheDocument();
    // Two "View only" notices now: the page-level banner and the pin row's own.
    expect(screen.getAllByText(/view only/i).length).toBeGreaterThanOrEqual(2);
  });

  it("shows Remove on the zone page's own pin panel when the zone is inside the official's area", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    addCommunityPin({ zoneId: zone.id, statusTag: "flooded", caption: "In-area pin", lat: 0, lng: 0 });
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: zone.psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };

    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, {
      official,
    });

    expect(await screen.findByText("In-area pin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove — flooded/i })).toBeInTheDocument();
  });
});

describe("ZoneDashboardPage alert control after a confirmed write (C1)", () => {
  // Mounts the real ReferenceDataProvider rather than renderWithData's fixed
  // context value: the defect was that the provider fetched /api/alerts once
  // and never again, so a static context cannot show it. `serverAlerts` is
  // what /api/alerts answers with right now; the mocked Server Action
  // changes it the way a successful set_zone_alert changes the database.
  const zone = FIXTURE_REFERENCE_DATA.zones[0];
  let serverAlerts: AlertRecord[] = [];

  const OFFICIAL: Official = {
    userId: "u1",
    displayName: "Test",
    areaCode: zone.psgcBarangayCode,
    areaName: "Own barangay",
    level: "barangay",
  };

  beforeEach(() => {
    localStorage.clear();
    serverAlerts = [];
    setZoneAlertMock.mockReset();
    setZoneAlertMock.mockImplementation(async ({ severity }: { severity: string }) => {
      serverAlerts =
        severity === "none"
          ? []
          : [
              {
                id: `alert-${severity}`,
                zoneId: zone.id,
                severity: severity as AlertRecord["severity"],
                message: { en: "Set by test.", fil: "Itinakda ng test." },
                source: "manual",
                confidence: "validated",
                issuedAt: new Date().toISOString(),
                isActive: true,
              },
            ];
      return { ok: true };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/data/reference-data.json") return { ok: true, json: async () => FIXTURE_REFERENCE_DATA };
        if (url.startsWith("/api/alerts")) return { ok: true, json: async () => serverAlerts };
        return { ok: true, json: async () => [] };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setZoneAlertMock.mockReset();
    setZoneAlertMock.mockResolvedValue({ ok: true });
  });

  function renderLive() {
    return render(
      <TooltipProvider>
        <LanguageProvider>
          <ReferenceDataProvider>
            <OfficialContext.Provider value={OFFICIAL}>
              <ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />
            </OfficialContext.Provider>
          </ReferenceDataProvider>
        </LanguageProvider>
      </TooltipProvider>
    );
  }

  it("shows the new severity once the write is confirmed, then lets the official choose Clear again", async () => {
    const user = userEvent.setup();
    renderLive();

    const select = await screen.findByRole("combobox", { name: /alert status/i });
    expect(select).toHaveTextContent(/clear — no alert/i);

    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Warning" }));

    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone.id, severity: "red" }));
    // Both the controlled select and the badge follow the store, no reload.
    await waitFor(() => expect(screen.getByRole("combobox", { name: /alert status/i })).toHaveTextContent("Warning"));
    expect(screen.queryByText("Clear", { exact: true })).not.toBeInTheDocument();

    // "Clear" must be selectable again: while the select still showed
    // "none", picking it fired no change at all.
    await user.click(screen.getByRole("combobox", { name: /alert status/i }));
    await user.click(await screen.findByRole("option", { name: /clear — no alert/i }));

    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone.id, severity: "none" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /alert status/i })).toHaveTextContent(/clear — no alert/i)
    );
    expect(screen.getByText("Clear", { exact: true })).toBeInTheDocument();
  });
});

describe("ZoneDashboardPage capacity control after a confirmed write (R1)", () => {
  // Mounts the real ReferenceDataProvider rather than renderWithData's fixed
  // context value: the defect was that the select read zone.centerStatus from
  // a zone list fetched once and never patched, so a static context cannot
  // show the regression. zones[0] starts "space_available" and is not
  // tracking a headcount (see the "capacity control" describe block above),
  // so the capacity select stays enabled here.
  const zone = FIXTURE_REFERENCE_DATA.zones[0];

  const OFFICIAL: Official = {
    userId: "u1",
    displayName: "Test",
    areaCode: zone.psgcBarangayCode,
    areaName: "Own barangay",
    level: "barangay",
  };

  beforeEach(() => {
    localStorage.clear();
    setCenterStatusMock.mockReset();
    setCenterStatusMock.mockResolvedValue({ ok: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/data/reference-data.json") return { ok: true, json: async () => FIXTURE_REFERENCE_DATA };
        if (url.startsWith("/api/alerts")) return { ok: true, json: async () => [] };
        return { ok: true, json: async () => [] };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setCenterStatusMock.mockReset();
    setCenterStatusMock.mockResolvedValue({ ok: true });
  });

  function renderLive() {
    return render(
      <TooltipProvider>
        <LanguageProvider>
          <ReferenceDataProvider>
            <OfficialContext.Provider value={OFFICIAL}>
              <ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />
            </OfficialContext.Provider>
          </ReferenceDataProvider>
        </LanguageProvider>
      </TooltipProvider>
    );
  }

  it("shows Full once the write is confirmed, then lets the official pick Space available again", async () => {
    const user = userEvent.setup();
    renderLive();

    const select = await screen.findByRole("combobox", { name: /evacuation center capacity/i });
    expect(select).toHaveTextContent(/space available/i);

    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Full" }));

    await waitFor(() => expect(setCenterStatusMock).toHaveBeenCalledWith({ zoneId: zone.id, status: "full" }));
    // The select must follow the confirmed write, no reload.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /evacuation center capacity/i })).toHaveTextContent("Full")
    );

    // "Space available" must be selectable again: while the select still
    // showed Full, picking it fired no change at all.
    await user.click(screen.getByRole("combobox", { name: /evacuation center capacity/i }));
    await user.click(await screen.findByRole("option", { name: "Space available" }));

    await waitFor(() =>
      expect(setCenterStatusMock).toHaveBeenCalledWith({ zoneId: zone.id, status: "space_available" })
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /evacuation center capacity/i })).toHaveTextContent(
        /space available/i
      )
    );
  });

  it("leaves the displayed status unchanged and shows the error when the write fails", async () => {
    setCenterStatusMock.mockResolvedValueOnce({ ok: false, permanent: true, error: "boom" });
    const user = userEvent.setup();
    renderLive();

    const select = await screen.findByRole("combobox", { name: /evacuation center capacity/i });
    expect(select).toHaveTextContent(/space available/i);

    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Full" }));

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /evacuation center capacity/i })).toHaveTextContent(
      /space available/i
    );
  });
});

describe("ZoneDashboardPage with no hazard data (I3)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders flood and landslide susceptibility as Unknown for a zone with no hazard rows", () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, {
      data: { hazards: {} },
    });

    expect(screen.getAllByText("Unknown")).toHaveLength(2);
  });
});

describe("ZoneDashboardPage rainfall trend", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("charts the live 12-hour rainfall from /api/weather, not invented history", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes("/api/weather")
            ? { current: null, rainfallHistory: [1, 2, 23], rainfallForecast: [] }
            : [],
      }))
    );
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />);
    expect(await screen.findByRole("img", { name: /rainfall, last 12 hours: starts at 1mm\/hr, now 23mm\/hr/i })).toBeInTheDocument();
  });

  it("shows the river outlook for the week (idea 1)", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes("/api/weather")
            ? {
                current: null,
                rainfallHistory: [1, 2, 3],
                rainfallForecast: [],
                river: { trend: "rising", todayM3s: 50, peakM3s: 95, peakDate: "2026-09-25", worstM3s: 140 },
              }
            : [],
      }))
    );
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />);
    expect(await screen.findByText(/rising: up to 95/i)).toBeInTheDocument();
    expect(screen.getByText(/worst case 140/i)).toBeInTheDocument();
  });

  it("says there is no reading instead of drawing a flat zero line", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />);
    expect(await screen.findByText(/no live weather reading right now/i)).toBeInTheDocument();
  });
});
