import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhotoLightbox } from "./photo-lightbox";

const PHOTO = "/mock/community-pin-example.jpg";

describe("PhotoLightbox", () => {
  it("shows the photo at full size with its pin's status and caption", () => {
    render(
      <PhotoLightbox
        photoDataUrl={PHOTO}
        statusTag="flooded"
        caption="Knee-deep by the market"
        onClose={() => {}}
      />
    );

    expect(screen.getByRole("img", { name: "Knee-deep by the market" })).toHaveAttribute("src", PHOTO);
    expect(screen.getByText("Flooded")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PhotoLightbox photoDataUrl={PHOTO} statusTag="rising" caption="" onClose={onClose} />
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("closes from the close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PhotoLightbox photoDataUrl={PHOTO} statusTag="rising" caption="" onClose={onClose} />
    );

    await user.click(screen.getByRole("button", { name: /close photo/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it("keeps labelling the photo as unverified community content", () => {
    render(
      <PhotoLightbox photoDataUrl={PHOTO} statusTag="flooded" caption="" onClose={() => {}} />
    );
    expect(screen.getByText(/unverified community photo/i)).toBeInTheDocument();
  });
});
