import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverlayDialog } from "./overlay-dialog";

describe("OverlayDialog", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("renders its content inside an accessible dialog", () => {
    render(
      <OverlayDialog onClose={() => {}} label="Test dialog" closeLabel="Close">
        <p>Dialog body</p>
      </OverlayDialog>
    );
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeInTheDocument();
    expect(screen.getByText("Dialog body")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <OverlayDialog onClose={onClose} label="Test" closeLabel="Close">
        <p>Body</p>
      </OverlayDialog>
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <OverlayDialog onClose={onClose} label="Test" closeLabel="Close">
        <p>Body</p>
      </OverlayDialog>
    );
    // The dialog role element itself is the content wrapper; its parent is the backdrop.
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the content", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <OverlayDialog onClose={onClose} label="Test" closeLabel="Close">
        <p>Body text</p>
      </OverlayDialog>
    );
    await user.click(screen.getByText("Body text"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("focuses the first focusable element in the content, not the close button", () => {
    render(
      <OverlayDialog onClose={() => {}} label="Test" closeLabel="Dismiss">
        <button type="button">First field</button>
      </OverlayDialog>
    );
    expect(screen.getByRole("button", { name: "First field" })).toHaveFocus();
  });

  it("falls back to the close button when the content has nothing focusable", () => {
    render(
      <OverlayDialog onClose={() => {}} label="Test" closeLabel="Dismiss">
        <p>No focusable content</p>
      </OverlayDialog>
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
  });

  it("closes from the close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <OverlayDialog onClose={onClose} label="Test" closeLabel="Dismiss">
        <p>Body</p>
      </OverlayDialog>
    );
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("locks page scroll while open and restores it on unmount", () => {
    const { unmount } = render(
      <OverlayDialog onClose={() => {}} label="Test" closeLabel="Close">
        <p>Body</p>
      </OverlayDialog>
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
