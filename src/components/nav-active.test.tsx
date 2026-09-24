import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithData } from "@/test-utils/render-with-data";
import { NAV_ACTIVE } from "./nav-active";

let pathname = "/evacuation";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { BottomNav } from "./bottom-nav";
import { ResidentNav } from "@/features/resident/resident-nav";
import { AdminHeader } from "@/features/admin/admin-header";

/** The selected item carries the shared, high-contrast marker and aria-current; the others carry neither. */
function expectOnlyCurrent(name: RegExp) {
  const current = screen.getByRole("link", { name });
  expect(current).toHaveAttribute("aria-current", "page");
  expect(current.className).toContain(NAV_ACTIVE);
  for (const link of screen.getAllByRole("link").filter((l) => l !== current && l.closest("nav"))) {
    expect(link).not.toHaveAttribute("aria-current");
    expect(link.className).not.toContain(NAV_ACTIVE);
  }
}

describe("the current page stands out in every menu (owner's request)", () => {
  it("resident bottom bar", () => {
    pathname = "/evacuation";
    renderWithData(<BottomNav />);
    expectOnlyCurrent(/evacuate/i);
  });

  it("resident account tabs", () => {
    pathname = "/resident/reports";
    renderWithData(<ResidentNav />);
    expectOnlyCurrent(/^reports$/i);
  });

  it("officials' menu", () => {
    pathname = "/admin/history";
    renderWithData(<AdminHeader />, {
      official: { userId: "a", displayName: "Admin", areaCode: "", areaName: "All areas", level: "admin" },
    });
    expectOnlyCurrent(/history/i);
  });
});
