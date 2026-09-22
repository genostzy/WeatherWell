import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignInPanel } from "./sign-in-panel";
import { LanguageProvider } from "@/features/i18n/language-provider";

const startGoogleSignIn = vi.fn();

vi.mock("@/lib/auth/sign-in", () => ({
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignIn(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  startGoogleSignIn.mockResolvedValue({ ok: true });
});

describe("SignInPanel", () => {
  it("shows the official heading only when next starts with /admin", () => {
    const { rerender } = render(<SignInPanel next="/admin" />);
    expect(screen.getByText("Sign in as an official")).toBeInTheDocument();

    rerender(<SignInPanel next="/map" />);
    expect(screen.queryByText("Sign in as an official")).not.toBeInTheDocument();
    expect(screen.getByText("Keep your reports on a new phone")).toBeInTheDocument();
  });

  it("treats /admin/ as the officials' route too", () => {
    render(<SignInPanel next="/admin/" />);
    expect(screen.getByText("Sign in as an official")).toBeInTheDocument();
  });

  describe("continuing without an account", () => {
    it("links straight to next, without signing in, for a resident", () => {
      render(<SignInPanel next="/map" />);

      const link = screen.getByRole("link", { name: /continue.*no account needed/i });
      expect(link).toHaveAttribute("href", "/map");
      expect(startGoogleSignIn).not.toHaveBeenCalled();
    });

    it("is omitted for the official heading — /admin requires a real account", () => {
      render(<SignInPanel next="/admin" />);
      expect(screen.queryByRole("link", { name: /continue.*no account needed/i })).not.toBeInTheDocument();
    });

    it("is also omitted for a nested /admin/... next", () => {
      render(<SignInPanel next="/admin/zone/zone-1" />);
      expect(screen.queryByRole("link", { name: /continue.*no account needed/i })).not.toBeInTheDocument();
    });
  });

  it("does not treat /administration or /admin-help as the officials' route", () => {
    // A bare `next.startsWith("/admin")` would wrongly match both of these —
    // "/admin" is a prefix of each, but neither is the admin area.
    const { rerender } = render(<SignInPanel next="/administration" />);
    expect(screen.queryByText("Sign in as an official")).not.toBeInTheDocument();
    expect(screen.getByText("Keep your reports on a new phone")).toBeInTheDocument();

    rerender(<SignInPanel next="/admin-help" />);
    expect(screen.queryByText("Sign in as an official")).not.toBeInTheDocument();
    expect(screen.getByText("Keep your reports on a new phone")).toBeInTheDocument();
  });

  it("shows the official-only disclaimer under the official heading", () => {
    render(<SignInPanel next="/admin/zone/zone-1" />);
    expect(
      screen.getByText("Signing in does not make you an official. The system owner appoints officials.")
    ).toBeInTheDocument();
  });

  it("calls startGoogleSignIn(next) from the Google button", async () => {
    render(<SignInPanel next="/admin" />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(startGoogleSignIn).toHaveBeenCalledWith("/admin"));
  });

  it("shows the failure notice and existing-account button only when notice=failed, which calls startGoogleSignIn with link:false", async () => {
    const { rerender } = render(<SignInPanel next="/admin" />);
    expect(screen.queryByRole("button", { name: "Sign in to your existing account" })).not.toBeInTheDocument();

    rerender(<SignInPanel next="/admin" notice="failed" />);
    expect(
      screen.getByText(
        "That didn't work. If this Google account is already used on another phone, sign in to that account instead."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign in to your existing account" }));

    await waitFor(() =>
      expect(startGoogleSignIn).toHaveBeenCalledWith("/admin", { link: false })
    );
  });

  it("shows an error result next to the control that produced it", async () => {
    startGoogleSignIn.mockResolvedValue({ ok: false, error: "linking failed" });
    render(<SignInPanel next="/admin" />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByText("linking failed")).toBeInTheDocument();
  });

  it("does not call startGoogleSignIn merely on mount", () => {
    render(<SignInPanel next="/admin" />);
    expect(startGoogleSignIn).not.toHaveBeenCalled();
  });

  it("offers no password account creation to residents", () => {
    // A resident never needs an account: reports are attributed to an
    // anonymous session. Offering sign-up is friction with no payoff, and
    // implies the app is unusable without it.
    render(
      <LanguageProvider>
        <SignInPanel next="/" />
      </LanguageProvider>
    );
    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("offers no email sign-in link, which cannot work without project SMTP", () => {
    render(
      <LanguageProvider>
        <SignInPanel next="/" />
      </LanguageProvider>
    );
    expect(screen.queryByRole("button", { name: /email me a sign-in link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /magic link/i })).not.toBeInTheDocument();
  });

  it("still offers Google, which is how officials sign in", () => {
    render(
      <LanguageProvider>
        <SignInPanel next="/admin" />
      </LanguageProvider>
    );
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });
});
