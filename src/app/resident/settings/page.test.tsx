import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/features/i18n/language-provider";

const getSession = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ auth: { getSession, signOut } }),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import ResidentSettingsPage from "./page";

describe("ResidentSettingsPage", () => {
  it("shows the signed-in email and a working sign-out button in English by default", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { email: "official@example.com" } } } });
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
});
