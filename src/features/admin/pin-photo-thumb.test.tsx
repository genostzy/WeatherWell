import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithData } from "@/test-utils/render-with-data";
import type { CommunityPin } from "@/lib/community-pins";

const createSignedUrl = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}));

import { PinPhotoThumb } from "./pin-photo-thumb";

const pin: CommunityPin = {
  id: "p1",
  zoneId: "zone-1",
  statusTag: "road_blocked",
  caption: "Fallen tree",
  lat: 1,
  lng: 2,
  upvotes: 0,
  downvotes: 0,
  createdAt: "2026-09-28T00:00:00Z",
  authorId: "u1",
  removed: false,
};

beforeEach(() => createSignedUrl.mockReset());

describe("PinPhotoThumb (officials see a pin's photo)", () => {
  it("shows nothing for a pin without a photo", () => {
    const { container } = renderWithData(<PinPhotoThumb pin={pin} />);
    expect(container).toBeEmptyDOMElement();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("signs a one-hour link and opens the photo", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/x.jpg" }, error: null });
    const user = userEvent.setup();
    const { container } = renderWithData(<PinPhotoThumb pin={{ ...pin, photoPath: "u1/x.jpg" }} />);
    await user.click(await screen.findByRole("button", { name: /view photo/i }));
    expect(createSignedUrl).toHaveBeenCalledWith("u1/x.jpg", 3600);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://signed/x.jpg");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/unverified photo sent by a resident\. deleted after 7 days/i)).toBeInTheDocument();
  });

  it("opens the photo over the whole page, not inside a map popup that would clip it", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/x.jpg" }, error: null });
    const user = userEvent.setup();
    // A Leaflet popup is positioned with a CSS transform, which turns a
    // position:fixed child into one sized and clipped by the popup.
    renderWithData(
      <div data-testid="popup">
        <PinPhotoThumb pin={{ ...pin, photoPath: "u1/x.jpg" }} />
      </div>
    );
    await user.click(await screen.findByRole("button", { name: /view photo/i }));
    expect(screen.getByTestId("popup")).not.toContainElement(screen.getByRole("dialog"));
  });

  it("names the viewer for any kind of pin, not only floods", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/x.jpg" }, error: null });
    const user = userEvent.setup();
    renderWithData(<PinPhotoThumb pin={{ ...pin, photoPath: "u1/x.jpg" }} />);
    await user.click(await screen.findByRole("button", { name: /view photo/i }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Pin photo");
  });

  it("says the photo can't be shown when signing fails", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "denied" } });
    renderWithData(<PinPhotoThumb pin={{ ...pin, photoPath: "u1/x.jpg" }} />);
    expect(await screen.findByText("Photo unavailable")).toBeInTheDocument();
  });
});
