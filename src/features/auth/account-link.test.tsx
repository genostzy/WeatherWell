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
});

describe("AccountLink", () => {
  it("renders nothing when there is no session", async () => {
    // A visitor who has never written has nothing to keep, and must not be
    // signed in just because this mounted.
    getSession.mockResolvedValue({ data: { session: null } });

    renderWithData(<AccountLink />);
    await waitFor(() => expect(getSession).toHaveBeenCalled());

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a keep-my-reports-on-a-new-phone link for an anonymous session", async () => {
    pathname = "/report";
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1", is_anonymous: true } } } });

    renderWithData(<AccountLink />);

    const link = await screen.findByRole("link", { name: "Keep your reports on a new phone" });
    expect(link).toHaveAttribute("href", "/sign-in?next=%2Freport");
  });

  it("shows a Sign out form posting to /auth/signout for a permanent session", async () => {
    pathname = "/report";
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1", is_anonymous: false } } } });

    renderWithData(<AccountLink />);

    const button = await screen.findByRole("button", { name: "Sign out" });
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
});
