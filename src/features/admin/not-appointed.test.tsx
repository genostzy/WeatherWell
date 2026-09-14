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
});
