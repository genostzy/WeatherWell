import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkerLegend } from "./marker-legend";

describe("MarkerLegend", () => {
  it("explains all four zone status labels up front", () => {
    render(<MarkerLegend />);
    expect(screen.getByText("Safe")).toBeInTheDocument();
    expect(screen.getByText("Cautionary")).toBeInTheDocument();
    expect(screen.getByText("Dangerous")).toBeInTheDocument();
    expect(screen.getByText("Hazardous")).toBeInTheDocument();
  });

  it("hides the marker-type icons behind a collapsed 'See more' toggle", () => {
    render(<MarkerLegend />);
    expect(screen.queryByText(/evacuation center/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /see more/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("reveals the evacuation and essential-service marker types on toggle", async () => {
    const user = userEvent.setup();
    render(<MarkerLegend />);

    await user.click(screen.getByRole("button", { name: /see more/i }));

    expect(screen.getByText(/evacuation center/i)).toBeInTheDocument();
    expect(screen.getByText(/health center/i)).toBeInTheDocument();
    expect(screen.getByText(/pharmacy/i)).toBeInTheDocument();
    expect(screen.getByText(/market/i)).toBeInTheDocument();
    expect(screen.getByText(/water/i)).toBeInTheDocument();
    expect(screen.getByText(/barangay office/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /see less/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("explains the community pin marker and labels it unverified", async () => {
    const user = userEvent.setup();
    render(<MarkerLegend />);

    await user.click(screen.getByRole("button", { name: /see more/i }));

    // Pins are the only citizen-created marker on the map; the legend has to
    // say so, or their dashed border is an unexplained visual difference.
    expect(screen.getByText(/community pin/i)).toBeInTheDocument();
    expect(screen.getByText(/unverified/i)).toBeInTheDocument();
  });
});
