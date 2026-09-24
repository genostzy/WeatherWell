import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Loading from "./loading";

describe("admin loading", () => {
  it("shows a dashboard-shaped placeholder while an officials' page loads", () => {
    render(<Loading />);
    const status = screen.getByRole("status", { name: /loading your dashboard/i });
    expect(status.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThanOrEqual(4);
  });
});
