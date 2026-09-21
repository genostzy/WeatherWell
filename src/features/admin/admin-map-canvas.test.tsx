import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));

const setCenterOccupancyMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/app/actions/set-center", () => ({
  setCenterOccupancy: (...args: unknown[]) => setCenterOccupancyMock(...args),
}));

import { AdminMapCanvas } from "./admin-map-canvas";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { readOutbox, applyEntryOutcome } from "@/lib/outbox/outbox";
import type { CommunityPin } from "@/lib/community-pins";
import type { OutboxPayloads } from "@/lib/outbox/types";

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

function queuedModeration(): OutboxPayloads["setPinRemoved"] {
  const entries = readOutbox();
  expect(entries).toHaveLength(1);
  expect(entries[0].operation).toBe("setPinRemoved");
  return entries[0].payload as OutboxPayloads["setPinRemoved"];
}

const zone = FIXTURE_REFERENCE_DATA.zones[0];
const HEADCOUNT_SETTLE_MS = 900;

describe("AdminMapCanvas", () => {
  beforeEach(() => {
    localStorage.clear();
    servePins([]);
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
    seedPin();
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);

    fireEvent.click(await screen.findByRole("img", { name: /flooded/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove pin/i }));

    expect(queuedModeration()).toEqual({ pinId: "pin-1", removed: true, reason: "admin" });
  });

  it("keeps an already-removed pin on the map so it can be restored", async () => {
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

  it("hides an orphaned pin (unresolvable zone) from the map", async () => {
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

    expect(await screen.findByRole("img", { name: /impassable/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /flooded/i })).not.toBeInTheDocument();
  });

  it("tells the admin when a moderation write is permanently refused", async () => {
    seedPin();
    renderWithData(<AdminMapCanvas zones={FIXTURE_REFERENCE_DATA.zones} />);

    fireEvent.click(await screen.findByRole("img", { name: /flooded/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove pin/i }));

    const [entry] = readOutbox();
    expect(entry.operation).toBe("setPinRemoved");
    applyEntryOutcome(entry.id, { result: "permanent", reason: "That pin is not yours to remove, or no longer exists." });

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
  });
});
