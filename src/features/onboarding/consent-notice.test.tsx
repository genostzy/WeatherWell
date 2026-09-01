import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentNotice } from "./consent-notice";

describe("ConsentNotice", () => {
  it("names both kinds of personal data it collects", () => {
    render(<ConsentNotice onAccept={() => {}} />);
    expect(screen.getByText(/location/i)).toBeInTheDocument();
    expect(screen.getByText(/phone number/i)).toBeInTheDocument();
  });

  it("cites the Data Privacy Act so the legal basis is visible", () => {
    render(<ConsentNotice onAccept={() => {}} />);
    expect(screen.getByText(/RA 10173/i)).toBeInTheDocument();
  });

  it("calls onAccept when the accept button is clicked", async () => {
    const onAccept = vi.fn();
    render(<ConsentNotice onAccept={onAccept} />);
    await userEvent.click(screen.getByRole("button", { name: /i understand/i }));
    expect(onAccept).toHaveBeenCalledOnce();
  });
});
