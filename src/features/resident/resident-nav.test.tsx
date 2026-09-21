import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { ResidentNav } from "./resident-nav";

let pathname = "/resident";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

describe("ResidentNav", () => {
  it("shows every tab in English by default", () => {
    render(<ResidentNav />);

    for (const label of ["Overview", "Reports", "Check-ins", "Pins", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("shows every tab in Filipino when that's the selected language", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ResidentNav />
      </LanguageProvider>
    );

    for (const label of ["Buod", "Mga Ulat", "Mga Check-in", "Mga Pin", "Mga Setting"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the current tab as the active page", () => {
    pathname = "/resident/reports";
    render(<ResidentNav />);

    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});
