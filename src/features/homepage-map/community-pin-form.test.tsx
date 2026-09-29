import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// The phone's canvas and the storage upload are pin-photo.ts's own business (see its tests).
const shrinkPhoto = vi.fn();
const uploadPinPhoto = vi.fn();
vi.mock("@/lib/pin-photo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pin-photo")>()),
  shrinkPhoto: (...args: unknown[]) => shrinkPhoto(...args),
  uploadPinPhoto: (...args: unknown[]) => uploadPinPhoto(...args),
}));

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

  it("says a photo goes only to officials, and offers none when editing", () => {
    const { unmount } = render(<CommunityPinForm onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/a photo, if you add one, goes only to officials/i)).toBeInTheDocument();
    unmount();
    render(
      <CommunityPinForm mode="edit" initialValues={{ statusTag: "rising", caption: "x" }} onSubmit={() => {}} onCancel={() => {}} />
    );
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
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

describe("CommunityPinForm: a photo for officials", () => {
  const shrunk = new Blob(["small"], { type: "image/jpeg" });
  const picked = () => new File(["big"], "flood.jpg", { type: "image/jpeg" });

  beforeEach(() => {
    localStorage.clear();
    shrinkPhoto.mockReset().mockResolvedValue(shrunk);
    uploadPinPhoto.mockReset().mockResolvedValue("u1/x.jpg");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  async function fillAndPick(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/short description/i), "Water at the gate");
    await user.upload(screen.getByLabelText(/add photo \(only officials see it\)/i), picked());
  }

  it("shows the notice the first time a photo is added, then not again", async () => {
    const user = userEvent.setup();
    const first = render(<CommunityPinForm onSubmit={() => {}} onCancel={() => {}} />);
    await fillAndPick(user);
    expect(screen.getByText(/only officials see this photo\. it is deleted after 7 days/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByRole("img", { name: /photo to send/i })).toBeInTheDocument();
    first.unmount();

    render(<CommunityPinForm onSubmit={() => {}} onCancel={() => {}} />);
    await fillAndPick(user);
    expect(screen.queryByText(/only officials see this photo/i)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /photo to send/i })).toBeInTheDocument();
  });

  it("uploads the shrunk photo, never the original, and sends the pin with its path", async () => {
    localStorage.setItem("weatherwell.pinPhotoNoticeSeen", "1");
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommunityPinForm onSubmit={onSubmit} onCancel={() => {}} />);
    await fillAndPick(user);
    await user.click(screen.getByRole("button", { name: /drop pin/i }));
    expect(uploadPinPhoto).toHaveBeenCalledWith(shrunk);
    expect(onSubmit).toHaveBeenCalledWith({ statusTag: "flooded", caption: "Water at the gate", photoPath: "u1/x.jpg" });
  });

  it("offline, sends the pin without the photo and says so", async () => {
    localStorage.setItem("weatherwell.pinPhotoNoticeSeen", "1");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommunityPinForm onSubmit={onSubmit} onCancel={() => {}} />);
    await fillAndPick(user);
    expect(screen.getByText(/photos need a connection — the pin will be sent without it/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /drop pin/i }));
    expect(uploadPinPhoto).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({ statusTag: "flooded", caption: "Water at the gate" });
  });

  it("keeps the pin when the photo can't be used, and says so", async () => {
    localStorage.setItem("weatherwell.pinPhotoNoticeSeen", "1");
    shrinkPhoto.mockRejectedValue(new Error("photo-unreadable"));
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommunityPinForm onSubmit={onSubmit} onCancel={() => {}} />);
    await fillAndPick(user);
    expect(screen.getByText(/this photo couldn't be used/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /drop pin/i }));
    expect(onSubmit).toHaveBeenCalledWith({ statusTag: "flooded", caption: "Water at the gate" });
  });

  it("lets the photo be removed before sending", async () => {
    localStorage.setItem("weatherwell.pinPhotoNoticeSeen", "1");
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommunityPinForm onSubmit={onSubmit} onCancel={() => {}} />);
    await fillAndPick(user);
    await user.click(screen.getByRole("button", { name: /remove photo/i }));
    await user.click(screen.getByRole("button", { name: /drop pin/i }));
    expect(uploadPinPhoto).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({ statusTag: "flooded", caption: "Water at the gate" });
  });

  it("lets go of the preview link when the photo is removed, and when the form closes", async () => {
    localStorage.setItem("weatherwell.pinPhotoNoticeSeen", "1");
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    const user = userEvent.setup();
    const form = render(<CommunityPinForm onSubmit={() => {}} onCancel={() => {}} />);
    await fillAndPick(user);
    await user.click(screen.getByRole("button", { name: /remove photo/i }));
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:preview");
    await user.upload(screen.getByLabelText(/add photo \(only officials see it\)/i), picked());
    form.unmount();
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it("uploads once when Send is pressed twice", async () => {
    localStorage.setItem("weatherwell.pinPhotoNoticeSeen", "1");
    let finish: (path: string) => void = () => {};
    uploadPinPhoto.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommunityPinForm onSubmit={onSubmit} onCancel={() => {}} />);
    await fillAndPick(user);
    const drop = screen.getByRole("button", { name: /drop pin/i });
    await user.click(drop);
    await user.click(drop);
    finish("u1/x.jpg");
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(uploadPinPhoto).toHaveBeenCalledTimes(1);
  });

  it("keeps the form open when the upload fails, so the pin can go without the photo", async () => {
    localStorage.setItem("weatherwell.pinPhotoNoticeSeen", "1");
    uploadPinPhoto.mockResolvedValue(null);
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommunityPinForm onSubmit={onSubmit} onCancel={() => {}} />);
    await fillAndPick(user);
    await user.click(screen.getByRole("button", { name: /drop pin/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/the photo couldn't be sent/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /drop pin/i }));
    expect(onSubmit).toHaveBeenCalledWith({ statusTag: "flooded", caption: "Water at the gate" });
  });
});
