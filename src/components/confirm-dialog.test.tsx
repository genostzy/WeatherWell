import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("shows the title and body, and calls onConfirm only on the confirm button", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="Delete this pin?"
        body="This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        closeLabel="Close"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText("Delete this pin?")).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel from the Cancel button without confirming", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="Delete this pin?"
        body="Body"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        closeLabel="Close"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes on Escape without confirming, same as any other overlay", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="Delete this pin?"
        body="Body"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        closeLabel="Close"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
