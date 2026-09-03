import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckInPanel } from "./check-in-panel";

describe("CheckInPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows no confirmation before a resident checks in", () => {
    render(<CheckInPanel zoneId="zone-1" />);
    expect(screen.queryByText(/you checked in/i)).not.toBeInTheDocument();
  });

  it("confirms after tapping I'm safe", async () => {
    const user = userEvent.setup();
    render(<CheckInPanel zoneId="zone-1" />);
    await user.click(screen.getByRole("button", { name: /i'm safe/i }));
    expect(screen.getByText(/you checked in as safe/i)).toBeInTheDocument();
  });

  it("confirms after tapping I need help", async () => {
    const user = userEvent.setup();
    render(<CheckInPanel zoneId="zone-1" />);
    await user.click(screen.getByRole("button", { name: /i need help/i }));
    expect(screen.getByText(/you checked in as needing help/i)).toBeInTheDocument();
  });

  it("lets a resident change their status after already checking in", async () => {
    const user = userEvent.setup();
    render(<CheckInPanel zoneId="zone-1" />);
    await user.click(screen.getByRole("button", { name: /i'm safe/i }));
    await user.click(screen.getByRole("button", { name: /i need help/i }));
    expect(screen.getByText(/you checked in as needing help/i)).toBeInTheDocument();
    expect(screen.queryByText(/you checked in as safe/i)).not.toBeInTheDocument();
  });
});
