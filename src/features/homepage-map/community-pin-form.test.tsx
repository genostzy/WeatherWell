import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommunityPinForm } from "./community-pin-form";

describe("CommunityPinForm", () => {
  it("submits the status tag and caption the resident chose", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommunityPinForm onSubmit={onSubmit} onCancel={() => {}} />);

    await user.click(screen.getByLabelText("Rising"));
    await user.type(screen.getByLabelText(/short description/i), "Water at the gate");
    await user.click(screen.getByRole("button", { name: /drop pin/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      statusTag: "rising",
      caption: "Water at the gate",
    });
  });

  it("won't drop a pin without a description, which the server would refuse after the form closed", async () => {
    // Seen on production 2026-09-25: the pin vanished and its queue entry read "This couldn't be accepted."
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommunityPinForm onSubmit={onSubmit} onCancel={() => {}} />);

    const drop = screen.getByRole("button", { name: /drop pin/i });
    expect(drop).toBeDisabled();
    await user.type(screen.getByLabelText(/short description/i), "   ");
    expect(drop).toBeDisabled();
    await user.click(drop);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/short description/i), "Knee-deep at the chapel");
    expect(drop).toBeEnabled();
  });

  it("prefills from the existing pin when editing, rather than starting blank", () => {
    render(
      <CommunityPinForm
        mode="edit"
        initialValues={{ statusTag: "impassable", caption: "Bridge is out" }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByLabelText("Impassable")).toBeChecked();
    expect(screen.getByLabelText(/short description/i)).toHaveValue("Bridge is out");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("has no way to attach a photo, and says so", () => {
    render(<CommunityPinForm onSubmit={() => {}} onCancel={() => {}} />);

    expect(screen.queryByRole("textbox", { name: /photo/i })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
    expect(screen.getByText(/photos can't be attached yet/i)).toBeInTheDocument();
  });

  it("tells the resident the pin itself — status, description, location — is shared with the barangay", () => {
    render(<CommunityPinForm onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/is shared with the barangay/i)).toBeInTheDocument();
  });
});

describe("CommunityPinForm: what's happening", () => {
  it("asks what's happening before the water status", () => {
    render(<CommunityPinForm onSubmit={() => {}} onCancel={() => {}} />);
    const kinds = screen.getByRole("radiogroup", { name: "What's happening?" });
    for (const name of ["Flood", "Road blocked", "Landslide", "Power line down", "Other"]) {
      expect(kinds).toContainElement(screen.getByLabelText(name));
    }
  });

  it("asks the water status only for a flood", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommunityPinForm onSubmit={onSubmit} onCancel={() => {}} />);

    await user.click(screen.getByLabelText("Road blocked"));
    expect(screen.queryByLabelText("Receding")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/short description/i), "Fallen tree");
    await user.click(screen.getByRole("button", { name: /drop pin/i }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ statusTag: "road_blocked" }));

    await user.click(screen.getByLabelText("Flood"));
    await user.click(screen.getByLabelText("Receding"));
    await user.click(screen.getByRole("button", { name: /drop pin/i }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ statusTag: "receding" }));
  });
});
