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

  it("explains that the other phone scans it with its own camera", async () => {
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByRole("button", { name: /qr|show code/i }));

    expect(screen.getByText(/camera/i)).toBeInTheDocument();
  });
});
