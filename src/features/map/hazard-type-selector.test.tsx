import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HazardTypeSelector, hazardMapTitle } from "./hazard-type-selector";

describe("HazardTypeSelector", () => {
  it("shows all three hazard types with Flood selected", () => {
    render(<HazardTypeSelector value="flood" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /flood/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: /landslide/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /storm surge/i })).toBeInTheDocument();
  });

  it("calls onChange with the clicked hazard type", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<HazardTypeSelector value="flood" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: /landslide/i }));
    expect(onChange).toHaveBeenCalledWith("landslide");
  });
});

describe("hazardMapTitle", () => {
  it("names both the hazard subject and the area, in English", () => {
    expect(hazardMapTitle("flood", "Barangay Nilombot, Mapandan", "en")).toBe(
      "Flood Risk Map — Barangay Nilombot, Mapandan"
    );
  });

  it("localizes the hazard word in Filipino, keeping the area name as-is", () => {
    expect(hazardMapTitle("flood", "Barangay Nilombot, Mapandan", "fil")).toBe(
      "Mapa ng Panganib sa Baha — Barangay Nilombot, Mapandan"
    );
  });

  it("reflects every hazard type, not just flood", () => {
    expect(hazardMapTitle("landslide", "Test Area", "en")).toBe("Landslide Risk Map — Test Area");
    expect(hazardMapTitle("storm_surge", "Test Area", "en")).toBe("Storm Surge Risk Map — Test Area");
    expect(hazardMapTitle("dam_release", "Test Area", "en")).toBe("Dam Release Risk Map — Test Area");
  });
});
