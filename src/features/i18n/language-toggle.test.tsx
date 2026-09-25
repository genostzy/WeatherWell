import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithData } from "@/test-utils/render-with-data";
import { LanguageToggle } from "./language-toggle";

describe("LanguageToggle (owner: one-row top bar on a phone)", () => {
  it("shows short labels but keeps full names for screen readers, and marks the current one", () => {
    renderWithData(<LanguageToggle />);
    const english = screen.getByRole("button", { name: "English" });
    const filipino = screen.getByRole("button", { name: "Filipino" });
    expect(english).toHaveTextContent("EN");
    expect(filipino).toHaveTextContent("FIL");
    expect(english).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(filipino);
    expect(screen.getByRole("button", { name: "Filipino" })).toHaveAttribute("aria-pressed", "true");
  });
});
