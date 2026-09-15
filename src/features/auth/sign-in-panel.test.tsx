import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignInPanel } from "./sign-in-panel";

const startGoogleSignIn = vi.fn();
const sendEmailSignInLink = vi.fn();

vi.mock("@/lib/auth/sign-in", () => ({
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignIn(...args),
  sendEmailSignInLink: (...args: unknown[]) => sendEmailSignInLink(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  startGoogleSignIn.mockResolvedValue({ ok: true });
  sendEmailSignInLink.mockResolvedValue({ ok: true });
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

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "official@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    await waitFor(() =>
      expect(sendEmailSignInLink).toHaveBeenCalledWith("official@example.com", "/admin")
    );
    expect(await screen.findByText("Check your email for a sign-in link.")).toBeInTheDocument();
  });

  it("shows the failure notice and existing-account button only when notice=failed, which calls startGoogleSignIn with link:false", async () => {
    const { rerender } = render(<SignInPanel next="/admin" />);
    expect(screen.queryByRole("button", { name: "Sign in to my existing account" })).not.toBeInTheDocument();

    rerender(<SignInPanel next="/admin" notice="failed" />);
    expect(
      screen.getByText(
        "That didn't work. If this Google account is already used on another phone, sign in to that account instead."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign in to my existing account" }));

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
});
