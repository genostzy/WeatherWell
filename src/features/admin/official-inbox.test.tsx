import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";

const setZoneAlertMock = vi.fn().mockResolvedValue({ ok: true });
const confirmMock = vi.fn().mockResolvedValue({ ok: true });
const setZoneAlertsMock = vi.fn(async (input: { zoneIds: string[] }) => ({ sent: input.zoneIds.length, failed: 0 }));
vi.mock("@/app/actions/set-zone-alert", () => ({
  setZoneAlert: (...args: unknown[]) => setZoneAlertMock(...args),
  confirmAutomaticAlert: (...args: unknown[]) => confirmMock(...args),
  setZoneAlerts: (input: { zoneIds: string[] }) => setZoneAlertsMock(input),
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
  beforeEach(() => {
    setZoneAlertMock.mockClear();
    confirmMock.mockClear();
  });

  it("asks the official to confirm or reject an automatic advisory", async () => {
    const alerts = [alertFor(zone1.id, { source: "auto_crowdsourced", confidence: "estimated" })];
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts });
    const item = screen.getByRole("listitem", { name: new RegExp(zone1.name) });
    expect(within(item).getByText(/residents report/i)).toBeInTheDocument();

    fireEvent.click(within(item).getByRole("button", { name: /confirm/i }));
    // Confirming keeps what residents reported (found testing the live site).
    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(zone1.id));
    expect(setZoneAlertMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/confirmed/i)).toBeInTheDocument();
  });

  it("clears an advisory the official rejects", async () => {
    const alerts = [alertFor(zone1.id, { source: "auto_crowdsourced" })];
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts });
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    await waitFor(() => expect(setZoneAlertMock).toHaveBeenCalledWith({ zoneId: zone1.id, severity: "none" }));
    expect(await screen.findByText(/alert lifted/i)).toBeInTheDocument();
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

  it("lets a municipal official alert every barangay in town at once", async () => {
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts: [] });
    fireEvent.change(screen.getByLabelText(/barangay/i), { target: { value: "__all__" } });
    fireEvent.click(screen.getByRole("radio", { name: /watch/i }));
    fireEvent.click(screen.getByRole("button", { name: /send alert/i }));
    await waitFor(() =>
      expect(setZoneAlertsMock).toHaveBeenCalledWith({ zoneIds: FIXTURE_REFERENCE_DATA.zones.map((z) => z.id), severity: "orange" })
    );
    expect(setZoneAlertMock).not.toHaveBeenCalled();
    expect(await screen.findByText(new RegExp(`sent to ${FIXTURE_REFERENCE_DATA.zones.length} barangays`, "i"))).toBeInTheDocument();
  });

  it("offers no all-barangays choice to a barangay official with one barangay", () => {
    renderWithData(<OfficialInbox zones={[zone1]} />, { alerts: [] });
    expect(screen.queryByRole("option", { name: /all .* barangays/i })).not.toBeInTheDocument();
  });

  it("spins only the button that was pressed", async () => {
    let finish: (v: { ok: true }) => void = () => {};
    setZoneAlertMock.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const alerts = [alertFor(zone1.id, { source: "auto_crowdsourced" })];
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts });
    const reject = screen.getByRole("button", { name: /reject/i });
    fireEvent.click(reject);
    await waitFor(() => expect(reject).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByRole("button", { name: /confirm/i })).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    finish({ ok: true });
    await waitFor(() => expect(reject).not.toHaveAttribute("aria-busy"));
  });

  it("shows the post to copy by hand when the browser blocks the clipboard (found testing the live site)", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) },
      configurable: true,
    });
    renderWithData(<OfficialInbox zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts: [alertFor(zone3.id, {})] });
    fireEvent.click(screen.getByRole("button", { name: /copy post for facebook/i }));
    const box = await screen.findByRole("textbox", { name: /post to copy/i });
    expect((box as HTMLTextAreaElement).value).toContain(zone3.name);
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
