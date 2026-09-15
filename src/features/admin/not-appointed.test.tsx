import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotAppointed } from "./not-appointed";

describe("NotAppointed", () => {
  it("shows the signed-in email to send to the system owner", () => {
    render(<NotAppointed email="resident@example.com" />);
    expect(screen.getByText("resident@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("points an anonymous session back to sign-in instead of showing an email", () => {
    render(<NotAppointed email={null} />);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/sign-in?next=/admin");
  });

  it("offers Sign out as a form POST to /auth/signout, for a wrong account or a removed official (M10)", () => {
    render(<NotAppointed email="resident@example.com" />);
    const button = screen.getByRole("button", { name: /sign out/i });
    const form = button.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/auth/signout");
    expect(form?.querySelector('input[name="next"]')).toHaveAttribute("value", "/");
  });

  it("offers Sign out to an anonymous session too", () => {
    render(<NotAppointed email={null} />);
    expect(screen.getByRole("button", { name: /sign out/i }).closest("form")).toHaveAttribute("action", "/auth/signout");
  });
});
