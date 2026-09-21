import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// The store drains the outbox after every moderation write, which reaches the
// real Supabase browser client. Nothing here should sign anyone in.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));

const setZoneAlertMock = vi.fn().mockResolvedValue({ ok: true });
const setCenterOccupancyMock = vi.fn().mockResolvedValue({ ok: true });

// Both are "use server" modules that pull in user-server.ts, which does
// `import "server-only"` — that throws unconditionally outside a real server
// bundler. AdminMapCanvas only ever reaches them through a dynamic import
// inside a popup control's change handler (see ZoneAlertSelect and
// CenterOccupancyControl), so this mock exists for the tests that fire one.
vi.mock("@/app/actions/set-zone-alert", () => ({
  setZoneAlert: (...args: unknown[]) => setZoneAlertMock(...args),
}));
vi.mock("@/app/actions/set-center", () => ({
  setCenterOccupancy: (...args: unknown[]) => setCenterOccupancyMock(...args),
}));

import { AdminMapCanvas } from "./admin-map-canvas";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { readOutbox, applyEntryOutcome } from "@/lib/outbox/outbox";
import type { CommunityPin } from "@/lib/community-pins";
import type { OutboxPayloads } from "@/lib/outbox/types";
import type { Official } from "@/lib/auth/official";
import { OfficialContext } from "@/lib/auth/official-context";
import { ReferenceDataProvider } from "@/lib/reference-data/provider";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AlertRecord } from "@/lib/types";

/**
 * Same shallow approach as MapCanvas's own test: jsdom has no layout engine,
 * so this checks that the admin controls render and that using one actually
 * calls the write behind it — not that Leaflet's pixel math is right.
 *
 * Marker popups only render once opened, so each test clicks the marker
 * (exposed as role="img" carrying the icon's aria-label) before querying the
 * control inside it.
 */

/**
 * Pins come from /api/pins now, so a test that wants one on the map serves
 * one. Moderation no longer writes to local storage either: it queues a
 * `setPinRemoved` entry, which is what these tests assert on.
 */
function servePins(pins: CommunityPin[]): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => pins }));
}

function seedPin(overrides: Partial<CommunityPin> = {}): void {
  servePins([
    {
      id: "pin-1",
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Test pin",
      lat: FIXTURE_REFERENCE_DATA.zones[0].lat,
      lng: FIXTURE_REFERENCE_DATA.zones[0].lng,
      upvotes: 0,
      downvotes: 0,
      createdAt: new Date().toISOString(),
      authorId: "user-1",
      removed: false,
      ...overrides,
    },
  ]);
}

/** The one queued moderation write, or a failure if there is not exactly one. */
function queuedModeration(): OutboxPayloads["setPinRemoved"] {
  const entries = readOutbox();
  expect(entries).toHaveLength(1);
  expect(entries[0].operation).toBe("setPinRemoved");
  return entries[0].payload as OutboxPayloads["setPinRemoved"];
}

const zone = FIXTURE_REFERENCE_DATA.zones[0];

/** Comfortably longer than the headcount control's commit debounce. */
const HEADCOUNT_SETTLE_MS = 900;

describe("AdminMapCanvas", () => {
  beforeEach(() => {
    localStorage.clear();
    servePins([]);
    setZoneAlertMock.mockClear();
    setCenterOccupancyMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the legend, hazard selector, and layer toggles", () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByText(/map legend/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /flood/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /community pins/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /cascade chain/i })).toBeChecked();
  });

  it("writes a severity when an admin picks one from a zone popup", async () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));

    fireEvent.change(screen.getByRole("combobox", { name: new RegExp(zone.name, "i") }), {
      target: { value: "evacuate" },
    });

    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone.id, severity: "evacuate" }));
  });

  it("clears a zone's alert — there is no longer an 'automatic' fallback to clear it to", async () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));
    const select = screen.getByRole("combobox", { name: new RegExp(zone.name, "i") });

    // The old "Automatic (from reports)" option is gone: since alerts now
    // live in Postgres there is no local mock to fall back to, only the
    // alert that exists or a deliberate clear.
    expect(screen.queryByRole("option", { name: /automatic/i })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "none" } });

    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone.id, severity: "none" }));
  });

  it("tells the admin when a severity write fails", async () => {
    setZoneAlertMock.mockResolvedValueOnce({ ok: false, permanent: true, error: "boom" });
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));

    fireEvent.change(screen.getByRole("combobox", { name: new RegExp(zone.name, "i") }), {
      target: { value: "evacuate" },
    });

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
  });

  it("shows the zone's computed risk score alongside the override control", () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));

    expect(screen.getByText(/risk score/i)).toBeInTheDocument();
    expect(screen.getByText(/advisory only/i)).toBeInTheDocument();
  });

  it("writes an evacuation center headcount from its marker popup", async () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.evacuationCenterName, "i") }));

    fireEvent.change(
      screen.getByRole("spinbutton", { name: new RegExp(zone.evacuationCenterName, "i") }),
      { target: { value: "120" } }
    );

    await waitFor(() =>
      expect(setCenterOccupancyMock).toHaveBeenCalledWith({ zoneId: zone.id, occupancy: 120 })
    );
  });

  it("writes a typed headcount of 120 once, on Enter, not once per keystroke (M9)", async () => {
    // Each write records a centre.occupancy history row, so typing "120" one
    // character at a time must not leave rows for 1 and 12 as well.
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.evacuationCenterName, "i") }));
    const input = screen.getByRole("spinbutton", { name: new RegExp(zone.evacuationCenterName, "i") });

    for (const value of ["1", "12", "120"]) fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(setCenterOccupancyMock).toHaveBeenCalledWith({ zoneId: zone.id, occupancy: 120 }));
    await new Promise((resolve) => setTimeout(resolve, HEADCOUNT_SETTLE_MS));
    expect(setCenterOccupancyMock).toHaveBeenCalledTimes(1);
  });

  it("writes a typed headcount once when typing stops, without Enter or leaving the field (M9)", async () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.evacuationCenterName, "i") }));
    const input = screen.getByRole("spinbutton", { name: new RegExp(zone.evacuationCenterName, "i") });

    for (const value of ["1", "12", "120"]) fireEvent.change(input, { target: { value } });

    await waitFor(() => expect(setCenterOccupancyMock).toHaveBeenCalledWith({ zoneId: zone.id, occupancy: 120 }));
    fireEvent.blur(input);
    await new Promise((resolve) => setTimeout(resolve, HEADCOUNT_SETTLE_MS));
    expect(setCenterOccupancyMock).toHaveBeenCalledTimes(1);
  });

  it("tells the admin when a headcount write fails", async () => {
    setCenterOccupancyMock.mockResolvedValueOnce({ ok: false, permanent: true, error: "boom" });
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.evacuationCenterName, "i") }));

    fireEvent.change(
      screen.getByRole("spinbutton", { name: new RegExp(zone.evacuationCenterName, "i") }),
      { target: { value: "120" } }
    );

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
  });

  it("queues a removal from a community pin's popup", async () => {
    // An operator moderating from a barangay hall during a storm is on the
    // same connection as everyone else, so the removal goes through the outbox
    // rather than straight to the server.
    seedPin();
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);

    fireEvent.click(await screen.findByRole("img", { name: /flooded/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove pin/i }));

    expect(queuedModeration()).toEqual({ pinId: "pin-1", removed: true, reason: "admin" });
  });

  it("keeps an already-removed pin on the map so it can be restored", async () => {
    // The whole point of the soft delete — a pin taken down by brigading
    // votes has to stay reachable for an admin to bring back.
    seedPin({ removed: true, removedReason: "net_score" });
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);

    fireEvent.click(await screen.findByRole("img", { name: /removed/i }));
    fireEvent.click(screen.getByRole("button", { name: /restore pin/i }));

    expect(queuedModeration()).toEqual({ pinId: "pin-1", removed: false, reason: "admin" });
  });

  it("hides the pin layer when its toggle is unchecked", async () => {
    seedPin();
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(await screen.findByRole("img", { name: /flooded/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /community pins/i }));

    expect(screen.queryByRole("img", { name: /flooded/i })).not.toBeInTheDocument();
  });

  it("shows controls for an in-area zone and 'View only' for a zone outside the official's area", () => {
    const otherZone = FIXTURE_REFERENCE_DATA.zones[1];
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: zone.psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />, { official });

    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));
    expect(screen.getByRole("combobox", { name: new RegExp(zone.name, "i") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.evacuationCenterName, "i") }));
    expect(
      screen.getByRole("spinbutton", { name: new RegExp(zone.evacuationCenterName, "i") })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("img", { name: new RegExp(otherZone.name, "i") }));
    expect(screen.queryByRole("combobox", { name: new RegExp(otherZone.name, "i") })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("img", { name: new RegExp(otherZone.evacuationCenterName, "i") }));
    expect(
      screen.queryByRole("spinbutton", { name: new RegExp(otherZone.evacuationCenterName, "i") })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/view only/i).length).toBeGreaterThan(0);
  });

  it("hides Remove/Restore on a community pin marker outside the official's area, and shows View only (F6-2)", async () => {
    const otherZone = FIXTURE_REFERENCE_DATA.zones[1];
    seedPin({ zoneId: otherZone.id, lat: otherZone.lat, lng: otherZone.lng });
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: zone.psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />, { official });

    fireEvent.click(await screen.findByRole("img", { name: /flooded/i }));

    expect(screen.queryByRole("button", { name: /remove pin/i })).not.toBeInTheDocument();
    expect(screen.getByText(/view only/i)).toBeInTheDocument();
  });

  it("still shows Remove/Restore on a community pin marker inside the official's area", async () => {
    seedPin({ zoneId: zone.id, lat: zone.lat, lng: zone.lng });
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: zone.psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />, { official });

    fireEvent.click(await screen.findByRole("img", { name: /flooded/i }));

    expect(screen.getByRole("button", { name: /remove pin/i })).toBeInTheDocument();
  });

  it("hides an orphaned pin (unresolvable zone) from the map, matching the moderation panel (F6-6)", async () => {
    servePins([
      {
        id: "pin-orphan",
        zoneId: "zone-does-not-exist",
        statusTag: "flooded",
        caption: "Orphaned",
        lat: 0,
        lng: 0,
        upvotes: 0,
        downvotes: 0,
        createdAt: new Date().toISOString(),
        authorId: "user-1",
        removed: false,
      },
      {
        id: "pin-real",
        zoneId: zone.id,
        statusTag: "impassable",
        caption: "Real",
        lat: zone.lat,
        lng: zone.lng,
        upvotes: 0,
        downvotes: 0,
        createdAt: new Date().toISOString(),
        authorId: "user-1",
        removed: false,
      },
    ]);
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);

    // Waiting for the real pin's marker proves the fetch resolved and the
    // merge ran — at that point the orphaned pin's absence is meaningful,
    // not just "nothing has loaded yet".
    expect(await screen.findByRole("img", { name: /impassable/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /flooded/i })).not.toBeInTheDocument();
  });

  it("tells the admin when a moderation write is permanently refused, instead of silently reverting (F6-3)", async () => {
    seedPin();
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);

    fireEvent.click(await screen.findByRole("img", { name: /flooded/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove pin/i }));

    const [entry] = readOutbox();
    expect(entry.operation).toBe("setPinRemoved");
    // Simulates what a real RLS-refused write looks like once the drain
    // classifies it (see setPinRemoved in app/actions/pins.ts) — the entry
    // this row is tracking becomes permanently failed.
    applyEntryOutcome(entry.id, { result: "permanent", reason: "That pin is not yours to remove, or no longer exists." });

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
  });
});

describe("AdminMapCanvas alert control after a confirmed write (C1)", () => {
  // The real ReferenceDataProvider, not renderWithData's fixed context: the
  // defect was the provider never refetching /api/alerts after a write.
  let serverAlerts: AlertRecord[] = [];

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

  it("shows the new severity once the write is confirmed, and Clear can be chosen again", async () => {
    render(
      <TooltipProvider>
        <LanguageProvider>
          <ReferenceDataProvider>
            <OfficialContext.Provider
              value={{ userId: "u1", displayName: "Test", areaCode: zone.psgcBarangayCode, areaName: "Own", level: "barangay" }}
            >
              <AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />
            </OfficialContext.Provider>
          </ReferenceDataProvider>
        </LanguageProvider>
      </TooltipProvider>
    );

    fireEvent.click(await screen.findByRole("img", { name: new RegExp(zone.name, "i") }));
    const select = () => screen.getByRole("combobox", { name: new RegExp(zone.name, "i") }) as HTMLSelectElement;
    expect(select().value).toBe("none");

    fireEvent.change(select(), { target: { value: "red" } });
    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone.id, severity: "red" }));
    await waitFor(() => expect(select().value).toBe("red"));

    fireEvent.change(select(), { target: { value: "none" } });
    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone.id, severity: "none" }));
    await waitFor(() => expect(select().value).toBe("none"));
  });
});

describe("AdminMapCanvas with no hazard data (I3)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders and shows a finite risk score for a zone with no hazard rows", () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />, { data: { hazards: {} } });
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));

    expect(screen.getByText(/risk score/i).textContent).toMatch(/risk score: \d+\/100/i);
  });
});

describe("AdminMapCanvas viewport culling", () => {
  // The reference data holds every zone nationwide (~42k at V1's real
  // scale), the same array the resident map receives — without culling,
  // AdminMapCanvas tried to place a status marker and an evac marker for
  // every one of them on every render.
  const farAwayZone = {
    ...zone,
    id: "zone-far-away",
    name: "Barangay Far Away",
    // ~370km from the fixture zones (all within ~0.1° of each other,
    // comfortably inside even the widest culling radius of 0.25°).
    lat: zone.lat + 3.3,
    lng: zone.lng,
    evacuationCenterName: "Far Away Evacuation Center",
  };

  it("renders a marker for a zone inside the viewport but not one ~370km away", () => {
    renderWithData(<AdminMapCanvas zones={[...FIXTURE_REFERENCE_DATA.zones, farAwayZone]} />);

    expect(screen.getByRole("img", { name: new RegExp(zone.name, "i") })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: new RegExp(zone.evacuationCenterName, "i") })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Barangay Far Away/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Far Away Evacuation Center/i })).not.toBeInTheDocument();
  });
});
