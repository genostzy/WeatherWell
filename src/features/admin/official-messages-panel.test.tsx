import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

const sendMock = vi.fn().mockResolvedValue({ ok: true });
const ackMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/actions/official-messages", () => ({
  sendOfficialMessage: (...args: unknown[]) => sendMock(...args),
  acknowledgeOfficialMessage: (...args: unknown[]) => ackMock(...args),
}));

vi.mock("@/features/onboarding/push-prompt", () => ({ PushPrompt: ({ zoneId }: { zoneId?: string }) => <button>Turn on alerts for {zoneId}</button> }));

import { OfficialMessagesPanel } from "./official-messages-panel";
import { renderWithData } from "@/test-utils/render-with-data";
import type { Official } from "@/lib/auth/official";
import type { OfficialMessage } from "@/lib/official-messages";
import { dispatchLiveChange } from "@/lib/live-changes";
import { act } from "@testing-library/react";

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

const HEADS_UP: OfficialMessage = {
  ...FROM_NILOMBOT,
  id: "m3",
  zoneId: "zone-1",
  direction: "heads_up",
  kind: "upstream_alert",
  body: "Barangay Poblacion is under Warning.",
  senderName: "WeatherWell",
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

describe("OfficialMessagesPanel phone notifications", () => {
  it("offers to send these updates to the official's phone too", () => {
    serve([]);
    renderWithData(<OfficialMessagesPanel />, { official: KAPITAN });
    expect(screen.getByText(/get these on your phone/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /turn on alerts for zone-1/i })).toBeInTheDocument();
  });
});

describe("OfficialMessagesPanel — an upstream heads-up", () => {
  it("shows it to the downstream barangay's official, who marks it seen", async () => {
    serve([HEADS_UP]);
    renderWithData(<OfficialMessagesPanel />, { official: KAPITAN });
    expect(await screen.findByText("Upstream alert")).toBeInTheDocument();
    expect(screen.getByText("Barangay Poblacion is under Warning.")).toBeInTheDocument();
    expect(screen.getByText("Water may reach you. Check your barangay.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /mark as seen/i }));
    await waitFor(() => expect(ackMock).toHaveBeenCalledWith("m3"));
  });

  it("speaks Filipino, and the town may mark it seen too", async () => {
    serve([HEADS_UP]);
    renderWithData(<OfficialMessagesPanel />, { official: TOWN, lang: "fil" });
    expect(await screen.findByText("Babala mula sa itaas")).toBeInTheDocument();
    expect(screen.getByText("Maaaring umabot sa inyo ang tubig. Suriin ang inyong barangay.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /markahang nakita/i })).toBeInTheDocument();
  });

  it("offers another barangay's official no button", async () => {
    serve([HEADS_UP]);
    renderWithData(<OfficialMessagesPanel />, {
      official: { ...KAPITAN, areaCode: "0105528011", areaName: "Barangay Poblacion, Mapandan" },
    });
    expect(await screen.findByText("Upstream alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as seen/i })).not.toBeInTheDocument();
  });

  it("says who saw it", async () => {
    serve([{ ...HEADS_UP, acknowledgedAt: new Date().toISOString(), acknowledgedByName: "Kap" }]);
    renderWithData(<OfficialMessagesPanel />, { official: TOWN });
    expect(await screen.findByText(/seen by kap/i)).toBeInTheDocument();
  });
});

describe("OfficialMessagesPanel live updates", () => {
  it("shows a new update from its own town without a reload, and ignores other towns'", async () => {
    serve([]);
    renderWithData(<OfficialMessagesPanel />, { official: KAPITAN });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    act(() => dispatchLiveChange({ kind: "message", zone_id: null, town_code: "0105526" }));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(fetch).toHaveBeenCalledTimes(1);

    serve([FROM_TOWN]);
    act(() => dispatchLiveChange({ kind: "message", zone_id: null, town_code: "0105528" }));
    expect(await screen.findByText("Rescue boat heading to Nilombot", undefined, { timeout: 3000 })).toBeInTheDocument();
  });
});
