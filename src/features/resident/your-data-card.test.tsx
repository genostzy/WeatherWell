import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/features/i18n/language-provider";

const deleteMyData = vi.fn();
vi.mock("@/app/actions/delete-my-data", () => ({ deleteMyData: () => deleteMyData() }));
const forgetThisPhone = vi.fn(async (_userId: string) => {});
vi.mock("@/lib/forget-this-phone", () => ({ forgetThisPhone: (userId: string) => forgetThisPhone(userId) }));
const signOut = vi.fn(async () => ({ error: null }));
const getSession = vi.fn(async () => ({ data: { session: { user: { id: "me" } } } }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: () => ({ auth: { signOut, getSession } }) }));
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
  it("saves the download as a file", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["{}"], { type: "application/json" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }));
    const createObjectURL = vi.fn(() => "blob:my-data");
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    show();
    expect(screen.getByText("Your data")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download my data" }));
    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith("/api/my-data", expect.anything());
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("says so when the download fails, rather than saving an error as the file", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, blob: async () => new Blob() }));
    show();
    await user.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not download your data. Try again.");
    vi.unstubAllGlobals();
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
    expect(forgetThisPhone).toHaveBeenCalledWith("me");
    // Locally: deleting the account already ended its sessions, and a network sign-out can fail.
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(push).toHaveBeenCalledWith("/onboarding");
  });

  it("still signs this phone out when forgetting it fails", async () => {
    const user = userEvent.setup();
    forgetThisPhone.mockRejectedValueOnce(new Error("storage blocked"));
    show();
    await user.click(screen.getByRole("button", { name: "Delete my data" }));
    await user.type(screen.getByRole("textbox"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete everything" }));
    await screen.findByText("Your data is deleted.");
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    // The data is deleted; a hiccup forgetting this phone is not an error to show.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "I-download ang aking data" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Burahin ang aking data" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Mananatili ang iyong mga ulat sa bilang ng barangay, nang wala ang iyong account o lokasyon.");
    expect(dialog).toHaveTextContent("Mananatili sa mapa ang iyong mga pin nang wala ang iyong account; buburahin ang mga larawan nito.");
    expect(dialog).toHaveTextContent("Buburahin ang iyong mga boto, check-in, alerto, security questions at account.");
    expect(dialog).toHaveTextContent("Mag-sa-sign out ang teleponong ito at magsisimula muli.");
  });
});
