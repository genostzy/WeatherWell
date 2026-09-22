import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignInPanel } from "./sign-in-panel";

const startGoogleSignIn = vi.fn();
const sendEmailSignInLink = vi.fn();
const signInWithPassword = vi.fn();
const signUpWithPassword = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/auth/sign-in", () => ({
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignIn(...args),
  sendEmailSignInLink: (...args: unknown[]) => sendEmailSignInLink(...args),
  signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
  signUpWithPassword: (...args: unknown[]) => signUpWithPassword(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  startGoogleSignIn.mockResolvedValue({ ok: true });
  sendEmailSignInLink.mockResolvedValue({ ok: true });
  signInWithPassword.mockResolvedValue({ ok: true });
  signUpWithPassword.mockResolvedValue({ ok: true });
});

/** The password form is the default mode, so no mode toggle is needed first. */
function fillPasswordFields(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
}

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

  describe("Continue as guest", () => {
    it("links straight to next, without signing in, for a resident", () => {
      render(<SignInPanel next="/map" />);

      const link = screen.getByRole("link", { name: "Continue as guest" });
      expect(link).toHaveAttribute("href", "/map");
      expect(startGoogleSignIn).not.toHaveBeenCalled();
    });

    it("is omitted for the official heading — /admin requires a real account", () => {
      render(<SignInPanel next="/admin" />);
      expect(screen.queryByRole("link", { name: "Continue as guest" })).not.toBeInTheDocument();
    });

    it("is also omitted for a nested /admin/... next", () => {
      render(<SignInPanel next="/admin/zone/zone-1" />);
      expect(screen.queryByRole("link", { name: "Continue as guest" })).not.toBeInTheDocument();
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

  it("calls sendEmailSignInLink(email, next) from the email button and shows the check-your-email line", async () => {
    render(<SignInPanel next="/admin" />);

    fireEvent.click(screen.getByRole("button", { name: "Use magic link instead" }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "official@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    await waitFor(() =>
      expect(sendEmailSignInLink).toHaveBeenCalledWith("official@example.com", "/admin")
    );
    expect(await screen.findByText("Check your email for a sign-in link.")).toBeInTheDocument();
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

  it("calls neither sign-in function on mount", () => {
    render(<SignInPanel next="/admin" />);
    expect(startGoogleSignIn).not.toHaveBeenCalled();
    expect(sendEmailSignInLink).not.toHaveBeenCalled();
  });

  describe("password sign-in", () => {
    it("calls signInWithPassword(email, password) and navigates to next on success", async () => {
      render(<SignInPanel next="/admin" />);

      fillPasswordFields("official@example.com", "hunter22");
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

      await waitFor(() =>
        expect(signInWithPassword).toHaveBeenCalledWith("official@example.com", "hunter22")
      );
      // Unlike Google (OAuth redirect) and the magic link (emailed link),
      // password sign-in resolves in place — nothing else moves the resident
      // off /sign-in, so the panel must do it itself.
      expect(push).toHaveBeenCalledWith("/admin");
      expect(refresh).toHaveBeenCalled();
    });

    it("shows an error next to the password form and does not navigate on a failed sign-in", async () => {
      signInWithPassword.mockResolvedValue({ ok: false, error: "Invalid login credentials" });
      render(<SignInPanel next="/admin" />);

      fillPasswordFields("official@example.com", "wrong");
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

      expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });

    it("calls signUpWithPassword after toggling to Create account, and stays on the page rather than navigating", async () => {
      // Account creation may still need an email-confirmation click before a
      // session exists (a Supabase project setting), so this must not
      // navigate the way a successful sign-in does — the resident is told to
      // check their email instead.
      render(<SignInPanel next="/admin" />);

      // Toggling swaps the submit button's own label to "Create account" too
      // (and the toggle link to "Sign in"), so fields are filled first while
      // "Create account" still names only the toggle, unambiguously.
      fireEvent.click(screen.getByRole("button", { name: "Create account" }));
      fillPasswordFields("resident@example.com", "hunter22");
      fireEvent.click(screen.getByRole("button", { name: "Create account" }));

      await waitFor(() =>
        expect(signUpWithPassword).toHaveBeenCalledWith("resident@example.com", "hunter22")
      );
      expect(await screen.findByText(/Account created/)).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });
  });
});
