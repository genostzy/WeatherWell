import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

// A "use server" module, reached through useSetBarangayDetails's dynamic import.
const setBarangayDetailsMock = vi.fn();
vi.mock("@/app/actions/set-barangay-details", () => ({
  setBarangayDetails: (...args: unknown[]) => setBarangayDetailsMock(...args),
}));

const setBarangayProfileMock = vi.fn();
vi.mock("@/app/actions/set-barangay-profile", () => ({
  setBarangayProfile: (...args: unknown[]) => setBarangayProfileMock(...args),
}));

import { BarangayDetailsForm } from "./barangay-details-form";

const zone = { ...FIXTURE_REFERENCE_DATA.zones[0], hotlineNumber: "0917 123 4567", extraHotlines: [] as string[] };
const saved = {
  id: zone.id,
  hotline_number: "0917 123 4567",
  extra_hotlines: [],
  evacuation_route_text: zone.evacuationRouteText,
};

beforeEach(() => {
  setBarangayDetailsMock.mockReset();
  setBarangayDetailsMock.mockResolvedValue({ ok: true, saved });
  setBarangayProfileMock.mockReset();
  setBarangayProfileMock.mockResolvedValue({
    ok: true,
    saved: { id: zone.id, flood: "high", landslide: "low", storm_surge: "low", downstream_zone_id: "zone-2" },
  });
});

describe("BarangayDetailsForm", () => {
  it("starts from what residents see now", () => {
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    expect(screen.getByLabelText("Hotline 1")).toHaveValue("0917 123 4567");
    expect(screen.getByLabelText("Hotline 2")).toHaveValue("");
    expect(screen.getByLabelText("Evacuation instructions (English)")).toHaveValue(zone.evacuationRouteText.en);
  });

  it("saves trimmed numbers, dropping blank ones", async () => {
    const user = userEvent.setup();
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    await user.clear(screen.getByLabelText("Hotline 1"));
    await user.type(screen.getByLabelText("Hotline 1"), " 0917 123 4567 ");
    await user.type(screen.getByLabelText("Hotline 3"), "(075) 522-1234");
    await user.clear(screen.getByLabelText("Evacuation instructions (English)"));
    await user.type(screen.getByLabelText("Evacuation instructions (English)"), "Go to the school.");
    await user.clear(screen.getByLabelText("Evacuation instructions (Filipino)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setBarangayDetailsMock).toHaveBeenCalledWith({
      zoneId: zone.id,
      hotlines: ["0917 123 4567", "(075) 522-1234"],
      instructions: { en: "Go to the school.", fil: "" },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved — residents see it the next time their app opens.");
  });

  it("refuses a bad number in the official's language, without sending", async () => {
    const user = userEvent.setup();
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />, { lang: "fil" });
    await user.type(screen.getByLabelText("Hotline 2"), "abc");
    await user.click(screen.getByRole("button", { name: "I-save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Ang hotline number ay 3 hanggang 20 digit, espasyo at + - ( ).");
    expect(setBarangayDetailsMock).not.toHaveBeenCalled();
  });

  it("refuses blank instructions", async () => {
    const user = userEvent.setup();
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    await user.clear(screen.getByLabelText("Evacuation instructions (English)"));
    await user.clear(screen.getByLabelText("Evacuation instructions (Filipino)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Write the instructions in English or Filipino.");
    expect(setBarangayDetailsMock).not.toHaveBeenCalled();
  });

  it("sends once when Save is tapped twice", async () => {
    const user = userEvent.setup();
    let finish: (value: unknown) => void = () => {};
    setBarangayDetailsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    const save = screen.getByRole("button", { name: "Save" });
    await user.click(save);
    await user.click(save);

    expect(setBarangayDetailsMock).toHaveBeenCalledTimes(1);
    finish({ ok: true, saved });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});

describe("BarangayDetailsForm: the review's fixes", () => {
  it("sends instructions without the whitespace around them", async () => {
    const user = userEvent.setup();
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    await user.clear(screen.getByLabelText("Evacuation instructions (English)"));
    await user.type(screen.getByLabelText("Evacuation instructions (English)"), "{Enter}");
    await user.clear(screen.getByLabelText("Evacuation instructions (Filipino)"));
    await user.type(screen.getByLabelText("Evacuation instructions (Filipino)"), "  Pumunta sa paaralan. ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setBarangayDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({ instructions: { en: "", fil: "Pumunta sa paaralan." } })
    );
  });

  it("leaves a box empty where residents only see the placeholder", () => {
    const seeded = {
      ...zone,
      evacuationRouteText: {
        en: "Contact your barangay captain for evacuation instructions.",
        fil: "Makipag-ugnayan sa inyong barangay captain para sa mga tagubilin sa paglikas.",
      },
    };
    renderWithData(<BarangayDetailsForm zone={seeded} onClose={() => {}} />);
    expect(screen.getByLabelText("Evacuation instructions (English)")).toHaveValue("");
    expect(screen.getByLabelText("Evacuation instructions (Filipino)")).toHaveValue("");
  });

  it("points to the hotline that needs fixing", async () => {
    const user = userEvent.setup();
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    await user.type(screen.getByLabelText("Hotline 2"), "abc");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Hotline 2: A hotline number uses 3 to 20 digits, spaces and + - ( ).");
    const field = screen.getByLabelText("Hotline 2");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", alert.id);
    expect(field).toHaveFocus();
  });
});

describe("BarangayDetailsForm: the flood profile", () => {
  it("starts at the barangay's levels and downstream barangay, the nearest choices first", () => {
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    expect(screen.getByRole("group", { name: "Flood profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("Flood")).toHaveValue("high");
    expect(screen.getByLabelText("Landslide")).toHaveValue("low");
    expect(screen.getByLabelText("Storm surge")).toHaveValue("low");
    const levels = Array.from((screen.getByLabelText("Flood") as HTMLSelectElement).options).map((o) => o.text);
    expect(levels).toEqual(["Low", "Medium", "High", "Not sure"]);
    const next = screen.getByLabelText("Where does your floodwater go next?") as HTMLSelectElement;
    expect(next).toHaveValue("zone-2");
    expect(Array.from(next.options).map((o) => o.text)).toEqual([
      "None / not sure",
      "Barangay Poblacion Norte, Santa Barbara (Santa Barbara)",
      "Barangay Poblacion, Manaoag (Manaoag)",
      "Barangay Poblacion, Mangaldan (Mangaldan)",
    ]);
  });

  it("speaks Filipino", () => {
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />, { lang: "fil" });
    expect(screen.getByRole("group", { name: "Profile sa baha" })).toBeInTheDocument();
    expect(screen.getByLabelText("Baha")).toBeInTheDocument();
    expect(screen.getByLabelText("Pagguho ng lupa")).toBeInTheDocument();
    const surge = screen.getByLabelText("Daluyong") as HTMLSelectElement;
    expect(Array.from(surge.options).map((o) => o.text)).toEqual(["Mababa", "Katamtaman", "Mataas", "Hindi tiyak"]);
    const next = screen.getByLabelText("Saan dumadaloy ang baha mula sa inyo?") as HTMLSelectElement;
    expect(next.options[0].text).toBe("Wala / hindi tiyak");
  });

  it("saves the details, then the profile", async () => {
    const user = userEvent.setup();
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    await user.selectOptions(screen.getByLabelText("Storm surge"), "unknown");
    await user.selectOptions(screen.getByLabelText("Where does your floodwater go next?"), "");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(setBarangayProfileMock).toHaveBeenCalledWith({
      zoneId: zone.id,
      flood: "high",
      landslide: "low",
      stormSurge: "unknown",
      downstreamZoneId: null,
    });
    expect(setBarangayDetailsMock.mock.invocationCallOrder[0]).toBeLessThan(
      setBarangayProfileMock.mock.invocationCallOrder[0]
    );
  });

  it("shows a refused profile's message and stays open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    setBarangayProfileMock.mockResolvedValue({ ok: false, permanent: true, error: "not an official for this barangay" });
    renderWithData(<BarangayDetailsForm zone={zone} onClose={onClose} />);
    await user.selectOptions(screen.getByLabelText("Flood"), "medium");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Flood")).toBeInTheDocument();
  });

  it("does not send a profile the official left alone, so a hotline fix never overwrites it", async () => {
    const user = userEvent.setup();
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(setBarangayDetailsMock).toHaveBeenCalled();
    expect(setBarangayProfileMock).not.toHaveBeenCalled();
  });

  it("does not send the profile when the details are refused", async () => {
    const user = userEvent.setup();
    setBarangayDetailsMock.mockResolvedValue({ ok: false, permanent: true, error: "down" });
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(setBarangayProfileMock).not.toHaveBeenCalled();
  });
});
