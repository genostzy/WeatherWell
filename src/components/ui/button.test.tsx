import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./button";

describe("Button loading", () => {
  it("shows a spinner, stays disabled and announces itself busy while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Send alert
      </Button>
    );
    const button = screen.getByRole("button", { name: /send alert/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("[data-slot=spinner]")).not.toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("has no spinner when idle", () => {
    render(<Button>Send alert</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeEnabled();
    expect(button.querySelector("[data-slot=spinner]")).toBeNull();
  });
});
