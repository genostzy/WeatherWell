import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithData } from "@/test-utils/render-with-data";
import type { OfficialRole } from "@/lib/auth/use-official-role";

let role: OfficialRole | null = null;
vi.mock("@/lib/auth/use-official-role", () => ({ useOfficialRole: () => role }));

import { OfficialBanner } from "./official-banner";

describe("OfficialBanner (officials saw the same resident screens as everyone)", () => {
  it("tells a municipal official who they are and links to their town's dashboard", () => {
    role = { level: "municipality", areaCode: "0105528", displayName: "Pedro" };
    renderWithData(<OfficialBanner />);
    expect(screen.getByText(/municipal official for mapandan/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open your dashboard/i })).toHaveAttribute("href", "/admin");
  });

  it("names a barangay official's barangay", () => {
    role = { level: "barangay", areaCode: "0105528012", displayName: "Kap" };
    renderWithData(<OfficialBanner />);
    expect(screen.getByText(/barangay official for barangay nilombot, mapandan/i)).toBeInTheDocument();
  });

  it("calls an admin the system admin", () => {
    role = { level: "admin", areaCode: "", displayName: "Admin" };
    renderWithData(<OfficialBanner />);
    expect(screen.getByText(/system admin/i)).toBeInTheDocument();
  });

  it("shows residents nothing", () => {
    role = null;
    const { container } = renderWithData(<OfficialBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
