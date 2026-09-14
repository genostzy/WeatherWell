import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Every write in this panel asks the outbox to drain, which reaches the real
// Supabase browser client. Nothing here should sign anyone in.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));

import { CommunityPinModerationPanel } from "./community-pin-moderation-panel";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { addCommunityPin, type CommunityPin } from "@/lib/community-pins";
import type { Official } from "@/lib/auth/official";

/**
 * Pins the server already knows about. Most cases below queue their own pin
 * instead, which the panel renders optimistically — the state an operator
 * moderating on a bad connection actually sees.
 */
function servePins(pins: CommunityPin[]): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => pins }));
}

describe("CommunityPinModerationPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    servePins([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists active pins with a Remove action", async () => {
    addCommunityPin({ zoneId: "zone-1", statusTag: "flooded", caption: "Test pin", lat: 0, lng: 0 });
    renderWithData(<CommunityPinModerationPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    expect(screen.getByText("Test pin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("moves a pin to the removed section on Remove, offering Restore instead of deleting it", async () => {
    const user = userEvent.setup();
    addCommunityPin({ zoneId: "zone-1", statusTag: "flooded", caption: "Removable pin", lat: 0, lng: 0 });
    renderWithData(<CommunityPinModerationPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    await user.click(screen.getByRole("button", { name: /remove — flooded/i }));

    // Still visible — the PRD requires removal to be reversible, not a hard delete.
    expect(screen.getByText("Removable pin")).toBeInTheDocument();
    expect(screen.getByText(/removed by admin/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove — flooded/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
  });

  it("brings a removed pin back to active on Restore", async () => {
    const user = userEvent.setup();
    addCommunityPin({ zoneId: "zone-1", statusTag: "impassable", caption: "Bring me back", lat: 0, lng: 0 });
    renderWithData(<CommunityPinModerationPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    await user.click(screen.getByRole("button", { name: /remove — impassable/i }));
    await user.click(screen.getByRole("button", { name: /restore/i }));

    expect(screen.queryByText(/removed by admin/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove — impassable/i })).toBeInTheDocument();
  });

  it("scopes the list to one zone when zoneId is given", () => {
    addCommunityPin({ zoneId: "zone-1", statusTag: "flooded", caption: "In zone 1", lat: 0, lng: 0 });
    addCommunityPin({ zoneId: "zone-2", statusTag: "rising", caption: "In zone 2", lat: 0, lng: 0 });

    renderWithData(<CommunityPinModerationPanel zones={FIXTURE_REFERENCE_DATA.zones} zoneId="zone-1" />);

    expect(screen.getByText("In zone 1")).toBeInTheDocument();
    expect(screen.queryByText("In zone 2")).not.toBeInTheDocument();
  });

  it("says there are no pins when the (possibly zone-scoped) list is empty", () => {
    renderWithData(<CommunityPinModerationPanel zones={FIXTURE_REFERENCE_DATA.zones} zoneId="zone-4" />);
    expect(screen.getByText(/no community pins/i)).toBeInTheDocument();
  });

  it("labels a net-score removal differently from an admin removal", async () => {
    servePins([removedServerPin({ caption: "Brigaded pin", removedReason: "net_score" })]);

    renderWithData(<CommunityPinModerationPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    expect(await screen.findByText("Brigaded pin")).toBeInTheDocument();
    expect(screen.getByText(/removed by votes/i)).toBeInTheDocument();
  });

  it("says an author withdrew their own pin rather than blaming an admin", async () => {
    // deleteOwnPin writes no reason, because the moderation trigger refuses a
    // resident writing one and neither allowed code means "the author took it
    // down". Reading a blank reason as "Removed by admin" would tell an
    // operator their own team acted when nobody did.
    servePins([removedServerPin({ caption: "Withdrawn pin", removedReason: undefined })]);

    renderWithData(<CommunityPinModerationPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    expect(await screen.findByText("Withdrawn pin")).toBeInTheDocument();
    expect(screen.getByText(/withdrawn by author/i)).toBeInTheDocument();
    expect(screen.queryByText(/removed by admin/i)).not.toBeInTheDocument();
  });

  it("only shows pins in zones inside the official's area, even without a zoneId scope", () => {
    addCommunityPin({ zoneId: "zone-1", statusTag: "flooded", caption: "In my area", lat: 0, lng: 0 });
    addCommunityPin({ zoneId: "zone-2", statusTag: "rising", caption: "Outside my area", lat: 0, lng: 0 });
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: FIXTURE_REFERENCE_DATA.zones[0].psgcBarangayCode, // zone-1
      areaName: "Own barangay",
      level: "barangay",
    };

    renderWithData(<CommunityPinModerationPanel zones={FIXTURE_REFERENCE_DATA.zones} />, { official });

    expect(screen.getByText("In my area")).toBeInTheDocument();
    expect(screen.queryByText("Outside my area")).not.toBeInTheDocument();
  });
});

function removedServerPin(over: Partial<CommunityPin>): CommunityPin {
  return {
    id: "pin-1",
    zoneId: "zone-1",
    statusTag: "flooded",
    caption: "Removed pin",
    lat: 0,
    lng: 0,
    upvotes: 0,
    downvotes: 0,
    createdAt: new Date().toISOString(),
    authorId: "user-1",
    removed: true,
    ...over,
  };
}
