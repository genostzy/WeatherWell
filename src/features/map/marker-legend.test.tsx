import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkerLegend } from "./marker-legend";

describe("MarkerLegend", () => {
  it("shows official marker types up front", () => {
    render(<MarkerLegend />);
    expect(screen.getByText(/flooded area/i)).toBeInTheDocument();
    expect(screen.getByText(/road damage/i)).toBeInTheDocument();
    expect(screen.getByText(/blocked passage/i)).toBeInTheDocument();
    expect(screen.getByText(/power outage/i)).toBeInTheDocument();
    expect(screen.getByText(/water supply issue/i)).toBeInTheDocument();
    expect(screen.getByText(/landslide/i)).toBeInTheDocument();
    expect(screen.getByText(/other hazard/i)).toBeInTheDocument();
  });

  it("hides the POI and community pin icons behind a collapsed 'See more' toggle", () => {
    render(<MarkerLegend />);
    expect(screen.queryByText(/evacuation center/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /see more/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("reveals the evacuation, POI, and community pin marker types on toggle", async () => {
    const user = userEvent.setup();
    render(<MarkerLegend />);

    await user.click(screen.getByRole("button", { name: /see more/i }));

    expect(screen.getByText(/evacuation center/i)).toBeInTheDocument();
    expect(screen.getByText(/health center/i)).toBeInTheDocument();
    expect(screen.getByText(/pharmacy/i)).toBeInTheDocument();
    expect(screen.getByText(/market/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /see less/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("explains the community pin marker and labels it unverified", async () => {
    const user = userEvent.setup();
    render(<MarkerLegend />);

    await user.click(screen.getByRole("button", { name: /see more/i }));

    expect(screen.getByText(/community pin/i)).toBeInTheDocument();
    expect(screen.getByText(/unverified/i)).toBeInTheDocument();
  });
});
