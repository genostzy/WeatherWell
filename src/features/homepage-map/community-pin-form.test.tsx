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
      photoDataUrl: undefined,
    });
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

  it("reports a cleared photo as an empty string, so an edit can remove one", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <CommunityPinForm
        mode="edit"
        initialValues={{ statusTag: "flooded", caption: "Deep", photoDataUrl: "data:image/png;base64,x" }}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /remove photo/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    // "" clears; undefined would mean "leave the existing photo alone".
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ photoDataUrl: "" }));
  });

  it("says plainly that an attached photo never leaves the device", () => {
    render(<CommunityPinForm onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument();
  });
});
