import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/features/i18n/language-provider";

const getSession = vi.fn();
const signOut = vi.fn();
let role = "resident";

// profiles answers with `role`; the cards' own reads (their questions, their
// subscription) answer with nothing.
const profileRead = vi.fn(async () => ({ data: { role }, error: null }));
const query = {
  select: () => query,
  eq: () => query,
  maybeSingle: profileRead,
};
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    auth: { getSession, signOut },
    from: (table: string) =>
      table === "profiles"
        ? query
        : { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) },
    rpc: async () => ({ data: [], error: null }),
  }),
}));

function signedInWith(providers: string[], email = "resident@example.com") {
  getSession.mockResolvedValue({
    data: { session: { user: { id: "user-1", email, app_metadata: { providers } } } },
  });
}

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import ResidentSettingsPage from "./page";

describe("ResidentSettingsPage", () => {
  it("shows the signed-in email and a working sign-out button in English by default", async () => {
    signedInWith([], "official@example.com");
    render(<ResidentSettingsPage />);

    expect(await screen.findByText("Signed in as official@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("renders fully in Filipino, including the anonymous fallback", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(
      <LanguageProvider initialLang="fil">
        <ResidentSettingsPage />
      </LanguageProvider>
    );

    expect(screen.getByText("Mga Setting")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(await screen.findByText("Naka-sign in nang hindi nagpapakilala")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mag-sign out" })).toBeInTheDocument();
  });

  it("lets a resident with a password set security questions", async () => {
    role = "resident";
    signedInWith(["email"]);
    render(<ResidentSettingsPage />);
    expect(await screen.findByText("Security questions")).toBeInTheDocument();
    expect(screen.queryByText("Email alerts")).not.toBeInTheDocument();
  });

  it("does not offer security questions to an official, who resets through an admin", async () => {
    role = "operator";
    signedInWith(["email"]);
    render(<ResidentSettingsPage />);
    await waitFor(() => expect(profileRead).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Security questions")).not.toBeInTheDocument();
    role = "resident";
  });

  it("offers email alerts to a Google account, naming its address", async () => {
    signedInWith(["google"], "someone@gmail.com");
    render(<ResidentSettingsPage />);
    expect(await screen.findByText("Email alerts")).toBeInTheDocument();
    expect(screen.getByText(/someone@gmail.com\. Every email has a link/)).toBeInTheDocument();
    expect(screen.queryByText("Security questions")).not.toBeInTheDocument();
  });
});
