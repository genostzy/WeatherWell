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
});
