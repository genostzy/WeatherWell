import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceTag } from "./confidence-tag";

describe("ConfidenceTag (PRD: confidence always shown, never hidden behind a number)", () => {
  it("says an automatic advisory with no track record is estimated, and what that means", () => {
    render(<ConfidenceTag source="auto_crowdsourced" confidence="estimated" lang="en" />);
    expect(screen.getByText(/estimated/i).closest("p")).toHaveTextContent(/haven't been checked against real floods/i);
  });

  it("says validated once officials have confirmed several", () => {
    render(<ConfidenceTag source="auto_crowdsourced" confidence="validated" lang="en" />);
    expect(screen.getByText(/validated/i).closest("p")).toHaveTextContent(/confirmed several/i);
  });

  it("says calibrated once tuned against the barangay's past floods", () => {
    render(<ConfidenceTag source="auto_crowdsourced" confidence="calibrated" lang="fil" />);
    expect(screen.getByText(/naisaayos/i)).toBeInTheDocument();
  });

  it("says an official's alert was set by an official", () => {
    render(<ConfidenceTag source="manual" confidence="validated" lang="en" />);
    expect(screen.getByText(/validated/i).closest("p")).toHaveTextContent(/set by an official/i);
  });
});
