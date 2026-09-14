import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";

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
