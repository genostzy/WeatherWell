import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

const sendMock = vi.fn().mockResolvedValue({ ok: true });
const ackMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/actions/official-messages", () => ({
  sendOfficialMessage: (...args: unknown[]) => sendMock(...args),
  acknowledgeOfficialMessage: (...args: unknown[]) => ackMock(...args),
}));

import { OfficialMessagesPanel } from "./official-messages-panel";
import { renderWithData } from "@/test-utils/render-with-data";
import type { Official } from "@/lib/auth/official";
import type { OfficialMessage } from "@/lib/official-messages";

const KAPITAN: Official = { userId: "k", displayName: "Kap", areaCode: "0105528012", areaName: "Barangay Nilombot, Mapandan", level: "barangay" };
const TOWN: Official = { userId: "t", displayName: "MDRRMO", areaCode: "0105528", areaName: "Mapandan", level: "municipality" };

const FROM_NILOMBOT: OfficialMessage = {
  id: "m1",
  townCode: "0105528",
  zoneId: "zone-1",
  direction: "up",
  kind: "centre_full",
  body: "School is full",
  senderName: "Kap",
  createdAt: new Date().toISOString(),
  acknowledgedAt: null,
  acknowledgedByName: null,
};
const FROM_TOWN: OfficialMessage = {
  ...FROM_NILOMBOT,
  id: "m2",
  zoneId: null,
  direction: "down",
  kind: "update",
  body: "Rescue boat heading to Nilombot",
  senderName: "MDRRMO",
};

function serve(messages: OfficialMessage[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => messages }));
}

beforeEach(() => {
  sendMock.mockClear();
  ackMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("OfficialMessagesPanel — barangay official", () => {
  it("shows a placeholder while updates load", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderWithData(<OfficialMessagesPanel />, { official: KAPITAN });
    expect(screen.getByRole("status", { name: /loading updates/i })).toBeInTheDocument();
  });

  it("shows the town's updates", async () => {
    serve([FROM_TOWN]);
    renderWithData(<OfficialMessagesPanel />, { official: KAPITAN });
    expect(await screen.findByText("Rescue boat heading to Nilombot")).toBeInTheDocument();
    expect(screen.getByText(/from the town/i)).toBeInTheDocument();
  });

  it("tells the town the centre is full in one tap, then refreshes", async () => {
    serve([]);
    renderWithData(<OfficialMessagesPanel />, { official: KAPITAN });
    fireEvent.click(await screen.findByRole("button", { name: /our centre is full/i }));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith({ kind: "centre_full", body: "" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/sent to mapandan/i)).toBeInTheDocument();
  });

  it("needs words for a free-text update", async () => {
    serve([]);
    renderWithData(<OfficialMessagesPanel />, { official: KAPITAN });
    const send = await screen.findByRole("button", { name: /send update/i });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Bridge on Rizal St is under water" } });
    fireEvent.click(send);
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith({ kind: "update", body: "Bridge on Rizal St is under water" }));
  });
});

describe("OfficialMessagesPanel — municipal official", () => {
  it("lists a barangay's update with its barangay and lets the town mark it seen", async () => {
    serve([FROM_NILOMBOT]);
    renderWithData(<OfficialMessagesPanel />, { official: TOWN });
    expect(await screen.findByText("School is full")).toBeInTheDocument();
    expect(screen.getByText(/barangay nilombot, mapandan/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /mark as seen/i }));
    await waitFor(() => expect(ackMock).toHaveBeenCalledWith("m1"));
  });

  it("sends an update to every barangay", async () => {
    serve([]);
    renderWithData(<OfficialMessagesPanel />, { official: TOWN });
    fireEvent.change(await screen.findByLabelText(/update to every barangay/i), { target: { value: "Evacuate low areas by 6 PM" } });
    fireEvent.click(screen.getByRole("button", { name: /send to every barangay/i }));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith({ kind: "update", body: "Evacuate low areas by 6 PM" }));
  });

  it("shows the database's refusal", async () => {
    serve([]);
    sendMock.mockResolvedValueOnce({ ok: false, permanent: true, error: "only a barangay or municipal official can send updates" });
    renderWithData(<OfficialMessagesPanel />, { official: TOWN });
    fireEvent.change(await screen.findByLabelText(/update to every barangay/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /send to every barangay/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
