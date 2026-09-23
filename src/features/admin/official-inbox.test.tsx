import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";

const setZoneAlertMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/actions/set-zone-alert", () => ({
  setZoneAlert: (...args: unknown[]) => setZoneAlertMock(...args),
}));

import { OfficialInbox } from "./official-inbox";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import type { AlertRecord } from "@/lib/types";

const [zone1, zone2, zone3] = FIXTURE_REFERENCE_DATA.zones;
const HOUR = 60 * 60 * 1000;

function alertFor(zoneId: string, changes: Partial<AlertRecord>): AlertRecord {
  return {
    id: `alert-${zoneId}`,
    zoneId,
    severity: "yellow",
    message: { en: "Advisory — 3 residents report knee-deep water (unverified).", fil: "Payo — baha." },
    source: "manual",
    confidence: "validated",
    issuedAt: new Date().toISOString(),
    isActive: true,
    ...changes,
  };
}

describe("OfficialInbox (ideas 4, 5, 13)", () => {
  beforeEach(() => setZoneAlertMock.mockClear());

  it("asks the official to confirm or reject an automatic advisory", async () => {
    const alerts = [alertFor(zone1.id, { source: "auto_crowdsourced", confidence: "estimated" })];
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts });
    const item = screen.getByRole("listitem", { name: new RegExp(zone1.name) });
    expect(within(item).getByText(/residents report/i)).toBeInTheDocument();

    fireEvent.click(within(item).getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone1.id, severity: "yellow" }));
  });

  it("clears an advisory the official rejects", async () => {
    const alerts = [alertFor(zone1.id, { source: "auto_crowdsourced" })];
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts });
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone1.id, severity: "none" }));
  });

  it("asks about an official's own alert once it is over a day old", async () => {
    const alerts = [alertFor(zone2.id, { severity: "red", issuedAt: new Date(Date.now() - 30 * HOUR).toISOString() })];
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts });
    const item = screen.getByRole("listitem", { name: new RegExp(zone2.name) });
    fireEvent.click(within(item).getByRole("button", { name: /still in effect/i }));
    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone2.id, severity: "red" }));
    fireEvent.click(within(item).getByRole("button", { name: /lift/i }));
    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone2.id, severity: "none" }));
  });

  it("leaves a fresh official alert alone and says when nothing needs attention", () => {
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts: [alertFor(zone3.id, {})] });
    expect(screen.getByText(/nothing needs you right now/i)).toBeInTheDocument();
  });

  it("ignores alerts outside the zones it was given", () => {
    const alerts = [alertFor(zone1.id, { source: "auto_crowdsourced" })];
    renderWithData(<OfficialInbox zones={[zone2]} />, { alerts });
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });

  it("sets an alert in three steps: barangay, severity, send", async () => {
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts: [] });
    fireEvent.change(screen.getByLabelText(/barangay/i), { target: { value: zone3.id } });
    fireEvent.click(screen.getByRole("radio", { name: /warning/i }));
    fireEvent.click(screen.getByRole("button", { name: /send alert/i }));
    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone3.id, severity: "red" }));
  });

  it("copies a ready-to-paste Facebook post for an active alert", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const alerts = [alertFor(zone3.id, {})];
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts });
    fireEvent.click(screen.getByRole("button", { name: /copy post for facebook/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain(zone3.name);
    expect(writeText.mock.calls[0][0]).toContain("Advisory");
  });
});
