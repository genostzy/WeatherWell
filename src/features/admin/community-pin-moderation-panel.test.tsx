import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommunityPinModerationPanel } from "./community-pin-moderation-panel";
import { MOCK_ZONES } from "@/lib/mock-data";
import { addCommunityPin } from "@/lib/community-pins";

describe("CommunityPinModerationPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    // The store falls back to two seeded demo pins when its key is entirely
    // absent (see community-pins.ts) — write an explicit empty array so
    // these tests start from a truly clean slate instead of that fallback.
    localStorage.setItem("weatherwell.communityPins", "[]");
  });

  it("lists active pins with a Remove action", async () => {
    addCommunityPin({ zoneId: "zone-1", statusTag: "flooded", caption: "Test pin", lat: 0, lng: 0 });
    render(<CommunityPinModerationPanel zones={MOCK_ZONES} />);

    expect(screen.getByText("Test pin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("moves a pin to the removed section on Remove, offering Restore instead of deleting it", async () => {
    const user = userEvent.setup();
    addCommunityPin({ zoneId: "zone-1", statusTag: "flooded", caption: "Removable pin", lat: 0, lng: 0 });
    render(<CommunityPinModerationPanel zones={MOCK_ZONES} />);

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
    render(<CommunityPinModerationPanel zones={MOCK_ZONES} />);

    await user.click(screen.getByRole("button", { name: /remove — impassable/i }));
    await user.click(screen.getByRole("button", { name: /restore/i }));

    expect(screen.queryByText(/removed by admin/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove — impassable/i })).toBeInTheDocument();
  });

  it("scopes the list to one zone when zoneId is given", () => {
    addCommunityPin({ zoneId: "zone-1", statusTag: "flooded", caption: "In zone 1", lat: 0, lng: 0 });
    addCommunityPin({ zoneId: "zone-2", statusTag: "rising", caption: "In zone 2", lat: 0, lng: 0 });

    render(<CommunityPinModerationPanel zones={MOCK_ZONES} zoneId="zone-1" />);

    expect(screen.getByText("In zone 1")).toBeInTheDocument();
    expect(screen.queryByText("In zone 2")).not.toBeInTheDocument();
  });

  it("says there are no pins when the (possibly zone-scoped) list is empty", () => {
    render(<CommunityPinModerationPanel zones={MOCK_ZONES} zoneId="zone-4" />);
    expect(screen.getByText(/no community pins/i)).toBeInTheDocument();
  });

  it("labels a net-score removal differently from an admin removal", async () => {
    addCommunityPin({ zoneId: "zone-1", statusTag: "flooded", caption: "Brigaded pin", lat: 0, lng: 0 });
    const pins = JSON.parse(localStorage.getItem("weatherwell.communityPins")!);
    pins[pins.length - 1].removed = true;
    pins[pins.length - 1].removedReason = "net_score";
    localStorage.setItem("weatherwell.communityPins", JSON.stringify(pins));

    render(<CommunityPinModerationPanel zones={MOCK_ZONES} />);

    expect(screen.getByText("Brigaded pin")).toBeInTheDocument();
    expect(screen.getByText(/removed by votes/i)).toBeInTheDocument();
  });
});
