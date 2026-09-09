import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";

// The store drains the outbox after every moderation write, which reaches the
// real Supabase browser client. Nothing here should sign anyone in.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));

import { AdminMapCanvas } from "./admin-map-canvas";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { readOutbox } from "@/lib/outbox/outbox";
import type { CommunityPin } from "@/lib/community-pins";
import type { OutboxPayloads } from "@/lib/outbox/types";

/**
 * Same shallow approach as MapCanvas's own test: jsdom has no layout engine,
 * so this checks that the admin controls render and that using one actually
 * writes to the store behind it — not that Leaflet's pixel math is right.
 *
 * Marker popups only render once opened, so each test clicks the marker
 * (exposed as role="img" carrying the icon's aria-label) before querying the
 * control inside it.
 */
function storedOverrides(): Record<string, { alertSeverity?: string; currentOccupancy?: number }> {
  const raw = localStorage.getItem("weatherwell.zoneOverrides");
  return raw ? JSON.parse(raw) : {};
}

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

  it("writes a severity override when an admin picks one from a zone popup", () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));

    fireEvent.change(screen.getByRole("combobox", { name: new RegExp(zone.name, "i") }), {
      target: { value: "evacuate" },
    });

    expect(storedOverrides()[zone.id]?.alertSeverity).toBe("evacuate");
  });

  it("clears the override back to automatic", () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));
    const select = screen.getByRole("combobox", { name: new RegExp(zone.name, "i") });

    fireEvent.change(select, { target: { value: "evacuate" } });
    fireEvent.change(select, { target: { value: "auto" } });

    // "auto" means no override at all, not an override whose value is "auto".
    expect(storedOverrides()[zone.id]?.alertSeverity).toBeUndefined();
  });

  it("shows the zone's computed risk score alongside the override control", () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));

    expect(screen.getByText(/risk score/i)).toBeInTheDocument();
    expect(screen.getByText(/advisory only/i)).toBeInTheDocument();
  });

  it("writes an evacuation center headcount from its marker popup", () => {
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.evacuationCenterName, "i") }));

    fireEvent.change(
      screen.getByRole("spinbutton", { name: new RegExp(zone.evacuationCenterName, "i") }),
      { target: { value: "120" } }
    );

    expect(storedOverrides()[zone.id]?.currentOccupancy).toBe(120);
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
