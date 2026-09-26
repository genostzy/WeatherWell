import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BarangayBar } from "./barangay-bar";
import { FIXTURE_REFERENCE_DATA, renderWithData } from "@/test-utils/render-with-data";

const [mine, x, y] = FIXTURE_REFERENCE_DATA.zones;

beforeEach(() => window.localStorage.clear());

describe("BarangayBar: my barangay", () => {
  it("names my barangay and lets me change it", async () => {
    renderWithData(<BarangayBar shownZone={mine} myZone={mine} whereYouAre={null} />);
    expect(screen.getByText(mine.name)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^change$/i }));
    expect(screen.getByRole("dialog", { name: "Change my barangay" })).toBeInTheDocument();
  });

  it("says when GPS puts me in another barangay, with a link to view it", () => {
    renderWithData(<BarangayBar shownZone={mine} myZone={mine} whereYouAre={y} />);
    expect(screen.getByText(`You're in ${y.name} now.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^view$/i })).toHaveAttribute("href", `/?zone=${y.id}`);
  });

  it("says nothing about where I am when that is my barangay, or unknown", () => {
    const { unmount } = renderWithData(<BarangayBar shownZone={mine} myZone={mine} whereYouAre={mine} />);
    expect(screen.queryByText(/you're in/i)).not.toBeInTheDocument();
    unmount();
    renderWithData(<BarangayBar shownZone={mine} myZone={mine} whereYouAre={null} />);
    expect(screen.queryByText(/you're in/i)).not.toBeInTheDocument();
  });
});

describe("BarangayBar: viewing another barangay", () => {
  it("says what is on screen, that alerts stay mine, and the way back", () => {
    renderWithData(<BarangayBar shownZone={x} myZone={mine} whereYouAre={null} />);
    expect(screen.getByText(`Viewing ${x.name}. Your alerts still come for ${mine.name}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to my barangay/i })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: /my location/i })).not.toBeInTheDocument();
  });

  it("offers My location when GPS puts me somewhere other than the one on screen", () => {
    const { unmount } = renderWithData(<BarangayBar shownZone={x} myZone={mine} whereYouAre={y} />);
    expect(screen.getByRole("link", { name: /my location/i })).toHaveAttribute("href", `/?zone=${y.id}`);
    unmount();

    renderWithData(<BarangayBar shownZone={x} myZone={mine} whereYouAre={mine} />);
    expect(screen.getByRole("link", { name: /my location/i })).toHaveAttribute("href", "/");
  });

  it("offers no My location when GPS puts me in the barangay on screen", () => {
    renderWithData(<BarangayBar shownZone={x} myZone={mine} whereYouAre={x} />);
    expect(screen.queryByRole("link", { name: /my location/i })).not.toBeInTheDocument();
  });
});
