import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HazardTypeSelector } from "./hazard-type-selector";

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
