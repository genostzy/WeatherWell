import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithData } from "@/test-utils/render-with-data";

const getSession = vi.fn();
const signInAnonymously = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ auth: { getSession, signInAnonymously, onAuthStateChange } }),
}));

let officialLevel: "admin" | "municipality" | "barangay" | null = null;
vi.mock("@/lib/auth/use-official-role", () => ({
  useOfficialRole: () => (officialLevel ? { level: officialLevel, areaCode: "0105528", displayName: "X" } : null),
}));

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import { AccountLink } from "./account-link";

beforeEach(() => {
  getSession.mockReset();
  signInAnonymously.mockReset();
  unsubscribe.mockReset();
  onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe } } });
  pathname = "/";
  officialLevel = null;
});

describe("AccountLink", () => {
  it("shows what a signed-out visitor's state means and a plain Sign in link when there is no session", async () => {
    // A visitor who has never written has nothing to keep, and must not be
    // signed in just because this mounted — but their status is still
    // shown, same as an anonymous visitor who has written something.
    pathname = "/report";
    getSession.mockResolvedValue({ data: { session: null } });

    renderWithData(<AccountLink />);

    expect(await screen.findByText(/saved on this device/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/sign-in?next=%2Freport");
  });

  it("shows what an anonymous session's state means and a keep-my-reports-on-a-new-phone link", async () => {
    pathname = "/report";
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1", is_anonymous: true } } } });

    renderWithData(<AccountLink />);

    expect(await screen.findByText(/saved on this device/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Keep your reports on a new phone" });
    expect(link).toHaveAttribute("href", "/sign-in?next=%2Freport");
  });

  it("tells a signed-out visitor what their state means rather than labelling them", async () => {
    // "Guest" reads as second-class for what is the correct state for
    // almost every resident. State the consequence instead.
    pathname = "/";
    getSession.mockResolvedValue({ data: { session: null } });

    renderWithData(<AccountLink />);

    expect(await screen.findByText(/saved on this device/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Guest$/)).not.toBeInTheDocument();
  });

  it("shows a Signed in status and a Sign out form posting to /auth/signout for a permanent session", async () => {
    pathname = "/report";
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1", is_anonymous: false } } } });

    renderWithData(<AccountLink />);

    expect(await screen.findByText("Signed in")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Sign out" });
    const form = button.closest("form");
    expect(form).toHaveAttribute("action", "/auth/signout");
    expect(form).toHaveAttribute("method", "post");
    expect(form?.querySelector('input[name="next"]')).toHaveValue("/report");
  });

  it("renders nothing on an admin route even with a permanent session", async () => {
    pathname = "/admin/zone/1";
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1", is_anonymous: false } } } });

    const { container } = renderWithData(<AccountLink />);
    // Give any (unwanted) async work a tick to resolve before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container).toBeEmptyDOMElement();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("renders nothing on the bare /admin route and on /admin/", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1", is_anonymous: false } } } });

    pathname = "/admin";
    const first = renderWithData(<AccountLink />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    pathname = "/admin/";
    const second = renderWithData(<AccountLink />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(second.container).toBeEmptyDOMElement();
  });

  it("does NOT suppress on /administration or /admin-help — only real /admin routes", async () => {
    // A bare `pathname.startsWith("/admin")` would wrongly treat these as
    // admin routes too. Both should behave exactly like any other page.
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1", is_anonymous: false } } } });

    pathname = "/administration";
    renderWithData(<AccountLink />);
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();

    pathname = "/admin-help";
    renderWithData(<AccountLink />);
    expect((await screen.findAllByRole("button", { name: "Sign out" })).length).toBeGreaterThan(0);
  });

  it("never calls signInAnonymously when mounted with no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    renderWithData(<AccountLink />);
    await waitFor(() => expect(getSession).toHaveBeenCalled());

    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("unsubscribes from onAuthStateChange on unmount", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    const { unmount } = renderWithData(<AccountLink />);
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("gives a signed-in official a way to their dashboard from any resident page", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1", is_anonymous: false } } } });
    officialLevel = "municipality";
    renderWithData(<AccountLink />);
    expect(await screen.findByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/admin");
  });

  it("gives a signed-in resident no dashboard link", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1", is_anonymous: false } } } });
    renderWithData(<AccountLink />);
    await screen.findByText(/signed in/i);
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
  });
});
