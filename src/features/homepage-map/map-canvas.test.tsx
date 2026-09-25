import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";

/**
 * MapCanvas asks who the resident is (to decide whose pins get Edit/Delete)
 * and the store tries to drain the outbox after a write. Both reach the real
 * Supabase browser client, which in a test would mean a network call to a
 * project that must never be touched from here. The hoisted `session` object
 * is how each case chooses an answer.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => session.userId,
}));

import { MapCanvas } from "./map-canvas";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { readOutbox } from "@/lib/outbox/outbox";
import type { CommunityPin } from "@/lib/community-pins";

/**
 * jsdom has no real layout engine, and Leaflet computes marker/tile
 * positions from actual container geometry. This is deliberately a shallow
 * smoke test — it checks that the component mounts and renders our own
 * legend/selector UI without throwing, not that Leaflet's internal pixel
 * math is correct. That's Leaflet's own tested responsibility, the same
 * principle already applied to Radix primitives elsewhere in this codebase.
 */
describe("MapCanvas", () => {
  const baseProps = {
    zones: FIXTURE_REFERENCE_DATA.zones,
    hazardType: "flood" as const,
    onHazardTypeChange: () => {},
    routeZone: null,
    routeHazard: false,
    effectiveRoutePolyline: [] as [number, number][],
    onSelectZone: () => {},
  };

  /** Pins come from /api/pins now, so a test that wants one serves one. */
  function servePins(pins: CommunityPin[]): void {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => pins }));
  }

  const pin = (over: Partial<CommunityPin> = {}): CommunityPin => ({
    id: "pin-1",
    zoneId: "zone-1",
    statusTag: "rising",
    caption: "Mine",
    lat: 16.03,
    lng: 120.44,
    upvotes: 0,
    downvotes: 0,
    createdAt: new Date().toISOString(),
    authorId: "user-1",
    removed: false,
    ...over,
  });

  beforeEach(() => {
    localStorage.clear();
    session.userId = null;
    servePins([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without throwing and shows the marker legend and hazard selector", () => {
    renderWithData(<MapCanvas {...baseProps} />);
    expect(screen.getByText(/map legend/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /flood/i })).toBeInTheDocument();
  });

  it("gathers hazard, layers and legend into one Map options panel, leaving the map clear (owner: tidy phone layout)", () => {
    const { container } = renderWithData(<MapCanvas {...baseProps} />);
    const options = [...container.querySelectorAll("details")].find((d) => /map options/i.test(d.querySelector("summary")?.textContent ?? ""));
    expect(options).toBeDefined();
    expect(options!.querySelector("[role=radiogroup]")).not.toBeNull();
    expect(options!.textContent).toMatch(/map legend/i);
    expect(options!.querySelectorAll("input[type=checkbox]").length).toBeGreaterThan(0);
    // Nothing else floats over the map for these.
    expect(container.querySelectorAll("[role=radiogroup]")).toHaveLength(1);
  });

  describe("evacuation center visibility", () => {
    it("does not show evacuation centers on the map by default", () => {
      // Showing every evacuation center up front reveals shelter capacity
      // and locations nobody asked for yet — it only becomes useful once a
      // resident is actually looking for one.
      renderWithData(<MapCanvas {...baseProps} />);
      expect(screen.queryByRole("img", { name: /evacuation center/i })).not.toBeInTheDocument();
    });

    it("reveals evacuation centers once the resident searches", () => {
      renderWithData(<MapCanvas {...baseProps} />);
      fireEvent.change(screen.getByPlaceholderText(/search zone/i), {
        target: { value: FIXTURE_REFERENCE_DATA.zones[0].name },
      });
      expect(screen.getAllByRole("img", { name: /evacuation center/i }).length).toBeGreaterThan(0);
    });

    it("hides evacuation centers again once the search is cleared", () => {
      renderWithData(<MapCanvas {...baseProps} />);
      const search = screen.getByPlaceholderText(/search zone/i);
      fireEvent.change(search, { target: { value: FIXTURE_REFERENCE_DATA.zones[0].name } });
      fireEvent.change(search, { target: { value: "" } });
      expect(screen.queryByRole("img", { name: /evacuation center/i })).not.toBeInTheDocument();
    });

    it("reveals evacuation centers when the parent reports 'find safe evacuation center' was used", () => {
      renderWithData(<MapCanvas {...baseProps} revealEvacuationCenters />);
      expect(screen.getAllByRole("img", { name: /evacuation center/i }).length).toBeGreaterThan(0);
    });
  });

  it("calls onSelectZone when a zone status marker is clicked", () => {
    const onSelectZone = vi.fn();
    renderWithData(<MapCanvas {...baseProps} onSelectZone={onSelectZone} />);

    fireEvent.click(screen.getByRole("img", { name: /Barangay Nilombot, Mapandan/i }));

    expect(onSelectZone).toHaveBeenCalledWith(FIXTURE_REFERENCE_DATA.zones[0].id);
  });

  describe("community pin actions", () => {
    it("hands this resident's own pin back to onDeletePin rather than deleting it itself", async () => {
      // MapCanvas only reports the intent — HomepageMap owns the actual
      // confirm-then-delete flow (see ConfirmDialog), so nothing must be
      // queued by this click.
      session.userId = "user-1";
      servePins([pin()]);
      const onDeletePin = vi.fn();

      renderWithData(<MapCanvas {...baseProps} onDeletePin={onDeletePin} />);
      fireEvent.click(await screen.findByRole("img", { name: /Rising/i }));
      fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));

      expect(onDeletePin).toHaveBeenCalledWith(expect.objectContaining({ caption: "Mine" }));
      expect(readOutbox()).toHaveLength(0);
    });

    it("only offers Edit/Delete on a pin this resident authored", async () => {
      // Authorship is the server's uid now, not a device id this browser made
      // up — the identity RLS actually enforces.
      session.userId = "user-1";
      servePins([pin({ statusTag: "flooded", caption: "Someone else's", authorId: "user-2" })]);

      renderWithData(<MapCanvas {...baseProps} />);
      fireEvent.click(await screen.findByRole("img", { name: /Flooded/i }));

      expect(screen.queryByRole("button", { name: /^Delete$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Edit$/i })).not.toBeInTheDocument();
    });

    it("offers Edit/Delete on a pin still queued on this device, which has no author id yet", async () => {
      // Attribution happens at replay, so a queued pin carries no uid. Hiding
      // its own controls from the resident who just placed it would make the
      // app look broken for exactly as long as they have no signal.
      const { addCommunityPin } = await import("@/lib/community-pins");
      addCommunityPin({
        zoneId: "zone-1",
        statusTag: "impassable",
        caption: "Just placed",
        lat: 16.03,
        lng: 120.44,
      });

      renderWithData(<MapCanvas {...baseProps} onEditPin={() => {}} onDeletePin={() => {}} />);
      fireEvent.click(await screen.findByRole("img", { name: /Impassable/i }));

      expect(screen.getByRole("button", { name: /^Edit$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Delete$/i })).toBeInTheDocument();
    });
  });
});

describe("MapCanvas with no hazard data (I3)", () => {
  it("renders the hazard backdrop for zones with no hazard rows without throwing", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    try {
      renderWithData(
        <MapCanvas
          zones={FIXTURE_REFERENCE_DATA.zones}
          hazardType="landslide"
          onHazardTypeChange={() => {}}
          routeZone={null}
          routeHazard={false}
          effectiveRoutePolyline={[]}
          onSelectZone={() => {}}
        />,
        { data: { hazards: {} } }
      );
      expect(screen.getByText(/map legend/i)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
