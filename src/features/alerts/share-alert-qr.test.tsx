import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareAlertQr } from "./share-alert-qr";
import { LanguageProvider } from "@/features/i18n/language-provider";
import type { SharedAlert } from "@/lib/alert-share/payload";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,FAKE") },
}));

const ALERT: SharedAlert = {
  v: 1,
  zoneId: "zone-1",
  zoneName: "Barangay Nilombot, Mapandan",
  severity: "red",
  issuedAt: "2026-09-22T14:32:00.000Z",
  message: "Knee-deep flooding reported.",
};

function renderQr() {
  return render(
    <LanguageProvider>
      <ShareAlertQr alert={ALERT} />
    </LanguageProvider>
  );
}

describe("ShareAlertQr", () => {
  it("renders no image until asked, so it costs nothing on an alert nobody shares", () => {
    renderQr();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders a scannable code on request", async () => {
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByRole("button", { name: /qr|show code/i }));

    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/png;base64,FAKE"));
  });

  it("encodes the same no-JavaScript ?d= link a text share sends (idea 6)", async () => {
    const qrcode = await import("qrcode");
    const user = userEvent.setup();
    renderQr();
    await user.click(screen.getByRole("button", { name: /qr|show code/i }));
    await waitFor(() => expect(qrcode.default.toDataURL).toHaveBeenCalled());
    const url = (qrcode.default.toDataURL as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as string;
    expect(url).toContain("/a?d=");
  });

  it("explains that the other phone scans it with its own camera", async () => {
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByRole("button", { name: /qr|show code/i }));

    expect(screen.getByText(/camera/i)).toBeInTheDocument();
  });

  it("gives the toggle a real touch target, matching every other primary control", () => {
    renderQr();
    const toggle = screen.getByRole("button", { name: /qr|show code/i });
    expect(toggle.className).toMatch(/h-11/);
  });

  it("shows a truthful fallback instead of silently doing nothing when the code can't be generated", async () => {
    // toDataURL rejects when the payload exceeds QR capacity — a long
    // bilingual alert message crosses that ceiling well before it looks long.
    const qrcode = await import("qrcode");
    (qrcode.default.toDataURL as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("data too big"));
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByRole("button", { name: /qr|show code/i }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/too long|can't|cannot/i)).toBeInTheDocument();
  });
});
