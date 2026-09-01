import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackLink } from "./back-link";

describe("BackLink", () => {
  it("links back to the home alert screen", () => {
    render(<BackLink />);
    expect(screen.getByRole("link", { name: /back to alerts/i })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it("meets the 44px minimum touch target via the shared lg size", () => {
    render(<BackLink />);
    expect(screen.getByRole("link", { name: /back to alerts/i }).className).toMatch(
      /h-11/
    );
  });
});
