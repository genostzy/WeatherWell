import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

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
import { readOutbox } from "@/lib/outbox/outbox";
import type { CommunityPin } from "@/lib/community-pins";
import type { OutboxPayloads } from "@/lib/outbox/types";

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
});
