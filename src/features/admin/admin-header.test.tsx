import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { AdminHeader } from "./admin-header";
import { renderWithData } from "@/test-utils/render-with-data";
import type { Official } from "@/lib/auth/official";

const OFFICIAL: Official = {
  userId: "official-1",
  displayName: "Juana Dela Cruz",
  areaCode: "1234567890",
  areaName: "Barangay Uno",
  level: "barangay",
};

describe("AdminHeader", () => {
  it("shows the official's name and area", () => {
    renderWithData(<AdminHeader />, { official: OFFICIAL });
    expect(screen.getByText(/Juana Dela Cruz/)).toBeInTheDocument();
    expect(screen.getByText(/Barangay Uno/)).toBeInTheDocument();
  });

  it("links to the history page", () => {
    renderWithData(<AdminHeader />, { official: OFFICIAL });
    expect(screen.getByRole("link", { name: /history/i })).toHaveAttribute("href", "/admin/history");
  });

  it("posts sign-out to /auth/signout with a hidden next of /", () => {
    renderWithData(<AdminHeader />, { official: OFFICIAL });
    const button = screen.getByRole("button", { name: /sign out/i });
    const form = button.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/auth/signout");
    expect(form?.querySelector('input[name="next"]')).toHaveValue("/");
  });

  it("shows an Officials link for an admin", () => {
    const admin: Official = {
      userId: "admin-1",
      displayName: "Test Admin",
      areaCode: "",
      areaName: "All areas",
      level: "admin",
    };
    renderWithData(<AdminHeader />, { official: admin });
    expect(screen.getByRole("link", { name: /officials/i })).toHaveAttribute("href", "/admin/officials");
  });

  it("names an admin's area in the reader's language (L2)", () => {
    const admin: Official = { userId: "admin-1", displayName: "Test Admin", areaCode: "", areaName: "All areas", level: "admin" };
    renderWithData(<AdminHeader />, { official: admin, lang: "fil" });
    expect(screen.getByText(/Lahat ng lugar/)).toBeInTheDocument();
  });

  it("hides the Officials link for a barangay official", () => {
    renderWithData(<AdminHeader />, { official: OFFICIAL });
    expect(screen.queryByRole("link", { name: /officials/i })).not.toBeInTheDocument();
  });
});

const TOWN: Official = { userId: "town-1", displayName: "Pedro Santos", areaCode: "0105528", areaName: "Mapandan", level: "municipality" };
const ADMIN: Official = { userId: "admin-1", displayName: "Test Admin", areaCode: "", areaName: "All areas", level: "admin" };

describe("AdminHeader role (each account sees who it is)", () => {
  it("badges each role plainly", () => {
    const { unmount } = renderWithData(<AdminHeader />, { official: OFFICIAL });
    expect(screen.getByText("Barangay official")).toBeInTheDocument();
    unmount();
    const town = renderWithData(<AdminHeader />, { official: TOWN });
    expect(screen.getByText("Municipal official")).toBeInTheDocument();
    town.unmount();
    renderWithData(<AdminHeader />, { official: ADMIN });
    expect(screen.getByText("System admin")).toBeInTheDocument();
  });

  it("gives a municipal official their town dashboard, the map and their barangay officials", () => {
    renderWithData(<AdminHeader />, { official: TOWN });
    expect(screen.getByRole("link", { name: /mapandan dashboard/i })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: /operations map/i })).toHaveAttribute("href", "/admin/map");
    expect(screen.getByRole("link", { name: /barangay officials/i })).toHaveAttribute("href", "/admin/officials");
    expect(screen.queryByRole("link", { name: /drill/i })).not.toBeInTheDocument();
  });

  it("gives a barangay official their barangay and History only", () => {
    renderWithData(<AdminHeader />, { official: OFFICIAL });
    expect(screen.getByRole("link", { name: /my barangay/i })).toHaveAttribute("href", "/admin");
    expect(screen.queryByRole("link", { name: /operations map/i })).not.toBeInTheDocument();
  });

  it("gives an admin the system dashboard, officials and the drill", () => {
    renderWithData(<AdminHeader />, { official: ADMIN });
    expect(screen.getByRole("link", { name: /system dashboard/i })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: /drill/i })).toHaveAttribute("href", "/admin/simulation");
  });
});
