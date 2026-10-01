import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/features/i18n/language-provider";

const deleteMyData = vi.fn();
vi.mock("@/app/actions/delete-my-data", () => ({ deleteMyData: () => deleteMyData() }));
const forgetThisPhone = vi.fn(async () => {});
vi.mock("@/lib/forget-this-phone", () => ({ forgetThisPhone: () => forgetThisPhone() }));
const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: () => ({ auth: { signOut } }) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { YourDataCard } from "./your-data-card";

function show(lang: "en" | "fil" = "en") {
  return render(
    <LanguageProvider initialLang={lang}>
      <YourDataCard />
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteMyData.mockResolvedValue({ ok: true });
});

describe("YourDataCard", () => {
  it("offers the download as a file", () => {
    show();
    expect(screen.getByText("Your data")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Download my data" });
    expect(link).toHaveAttribute("href", "/api/my-data");
    expect(link).toHaveAttribute("download");
  });

  it("says what deleting does before anything is deleted", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Delete my data" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Your reports stay in your barangay's counts, without your account or location.");
    expect(dialog).toHaveTextContent("Your pins stay on the map without your account; their photos are deleted.");
    expect(dialog).toHaveTextContent("Your votes, check-ins, alerts, security questions and account are deleted.");
    expect(dialog).toHaveTextContent("This phone is signed out and starts again.");
    expect(deleteMyData).not.toHaveBeenCalled();
  });

  it("deletes only once DELETE is typed, then forgets this phone and starts again", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Delete my data" }));
    const confirm = screen.getByRole("button", { name: "Delete everything" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "delete");
    expect(confirm).toBeDisabled();
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "DELETE");
    await user.click(confirm);

    expect(await screen.findByText("Your data is deleted.")).toBeInTheDocument();
    expect(deleteMyData).toHaveBeenCalledTimes(1);
    expect(forgetThisPhone).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding");
  });

  it("shows why it failed and stays", async () => {
    const user = userEvent.setup();
    deleteMyData.mockResolvedValue({ ok: false, permanent: false, error: "auth down" });
    show();
    await user.click(screen.getByRole("button", { name: "Delete my data" }));
    await user.type(screen.getByRole("textbox"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete everything" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(forgetThisPhone).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("speaks Filipino", async () => {
    const user = userEvent.setup();
    show("fil");
    expect(screen.getByText("Ang iyong data")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "I-download ang aking data" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Burahin ang aking data" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Mananatili ang iyong mga ulat sa bilang ng barangay, nang wala ang iyong account o lokasyon.");
    expect(dialog).toHaveTextContent("Mananatili sa mapa ang iyong mga pin nang wala ang iyong account; buburahin ang mga larawan nito.");
    expect(dialog).toHaveTextContent("Buburahin ang iyong mga boto, check-in, alerto, security questions at account.");
    expect(dialog).toHaveTextContent("Mag-sa-sign out ang teleponong ito at magsisimula muli.");
  });
});
