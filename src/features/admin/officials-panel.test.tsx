import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OfficialsPanel } from "./officials-panel";
import { LanguageProvider } from "@/features/i18n/language-provider";

const appointOfficial = vi.fn();
const removeOfficial = vi.fn();

vi.mock("@/app/actions/appoint-official", () => ({
  appointOfficial: (...args: unknown[]) => appointOfficial(...args),
}));
vi.mock("@/app/actions/remove-official", () => ({
  removeOfficial: (...args: unknown[]) => removeOfficial(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const OFFICIALS = [
  { email: "juan@example.com", displayName: "Juan Dela Cruz, BDRRMO Nilombot", areaName: "Barangay Nilombot, Mapandan" },
];

function renderPanel(officials = OFFICIALS) {
  return render(
    <LanguageProvider>
      <OfficialsPanel officials={officials} />
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  appointOfficial.mockResolvedValue({ ok: true });
  removeOfficial.mockResolvedValue({ ok: true });
});

describe("OfficialsPanel", () => {
  it("lists every current official by name and area", () => {
    renderPanel();
    expect(screen.getByText("Juan Dela Cruz, BDRRMO Nilombot")).toBeInTheDocument();
    expect(screen.getByText("Barangay Nilombot, Mapandan")).toBeInTheDocument();
  });

  it("appoints a new official from the form and refreshes on success", async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "maria@example.com" } });
    fireEvent.change(screen.getByLabelText(/area/i), { target: { value: "Barangay Poblacion, Mangaldan" } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Maria Santos" } });
    fireEvent.click(screen.getByRole("button", { name: /appoint/i }));

    await waitFor(() =>
      expect(appointOfficial).toHaveBeenCalledWith({
        email: "maria@example.com",
        area: "Barangay Poblacion, Mangaldan",
        displayName: "Maria Santos",
      })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the database's own error text on a failed appointment, without refreshing", async () => {
    appointOfficial.mockResolvedValue({
      ok: false,
      permanent: true,
      error: "No account for maria@example.com. Ask them to sign in once first.",
    });
    renderPanel();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "maria@example.com" } });
    fireEvent.change(screen.getByLabelText(/area/i), { target: { value: "Mapandan" } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Maria" } });
    fireEvent.click(screen.getByRole("button", { name: /appoint/i }));

    expect(await screen.findByText("No account for maria@example.com. Ask them to sign in once first.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("removes an official and refreshes on success", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(removeOfficial).toHaveBeenCalledWith({ email: "juan@example.com" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
