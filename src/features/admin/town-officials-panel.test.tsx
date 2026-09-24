import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";

const appointMock = vi.fn().mockResolvedValue({ ok: true });
const removeMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/actions/town-officials", () => ({
  appointBarangayOfficial: (...args: unknown[]) => appointMock(...args),
  removeBarangayOfficial: (...args: unknown[]) => removeMock(...args),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { TownOfficialsPanel } from "./town-officials-panel";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import type { Official } from "@/lib/auth/official";

const nilombot = FIXTURE_REFERENCE_DATA.zones[0]; // Barangay Nilombot, Mapandan (0105528012)
const TOWN: Official = { userId: "t", displayName: "MDRRMO", areaCode: "0105528", areaName: "Mapandan", level: "municipality" };

beforeEach(() => {
  appointMock.mockClear();
  removeMock.mockClear();
  refresh.mockClear();
});

describe("TownOfficialsPanel (a municipal official manages their barangay officials)", () => {
  it("offers only the barangays in their own town", () => {
    renderWithData(<TownOfficialsPanel officials={[]} />, { official: TOWN });
    const options = within(screen.getByLabelText(/barangay/i)).getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain(nilombot.name);
    expect(options.some((o) => /mangaldan/i.test(o ?? ""))).toBe(false);
  });

  it("appoints someone by email to a barangay and refreshes the list", async () => {
    renderWithData(<TownOfficialsPanel officials={[]} />, { official: TOWN });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "kap@example.com" } });
    fireEvent.change(screen.getByLabelText(/barangay/i), { target: { value: nilombot.id } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Kap. Juan, BDRRMC Nilombot" } });
    fireEvent.click(screen.getByRole("button", { name: /appoint/i }));
    await waitFor(() =>
      expect(appointMock).toHaveBeenCalledWith({ email: "kap@example.com", zoneId: nilombot.id, displayName: "Kap. Juan, BDRRMC Nilombot" })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("lists who holds which barangay, and removes one", async () => {
    renderWithData(
      <TownOfficialsPanel officials={[{ userId: "u9", displayName: "Kap Nilo", areaCode: nilombot.psgcBarangayCode }]} />,
      { official: TOWN }
    );
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Kap Nilo")).toBeInTheDocument();
    expect(within(row).getByText(nilombot.name)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: /remove/i }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith("u9"));
  });

  it("shows the database's refusal", async () => {
    appointMock.mockResolvedValueOnce({ ok: false, permanent: true, error: "No account for x@y.z. Ask them to sign in once first." });
    renderWithData(<TownOfficialsPanel officials={[]} />, { official: TOWN });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "x@y.z" } });
    fireEvent.change(screen.getByLabelText(/barangay/i), { target: { value: nilombot.id } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /appoint/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign in once/i);
  });
});
