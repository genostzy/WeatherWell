import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const linkIdentity = vi.fn();
const signInWithOAuth = vi.fn();
const signInAnonymously = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    auth: {
      getSession,
      linkIdentity,
      signInWithOAuth,
      signInAnonymously,
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: null } });
  linkIdentity.mockResolvedValue({ error: null });
  signInWithOAuth.mockResolvedValue({ error: null });
});

const origin = window.location.origin;

describe("startGoogleSignIn", () => {
  it("links Google to an existing anonymous session rather than starting a new sign-in", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    const { startGoogleSignIn } = await import("./sign-in");

    await startGoogleSignIn("/admin");

    expect(linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=%2Fadmin` },
    });
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("signs in fresh when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { startGoogleSignIn } = await import("./sign-in");

    await startGoogleSignIn("/admin");

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=%2Fadmin` },
    });
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("skips linking when { link: false } is passed even with an anonymous session", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    const { startGoogleSignIn } = await import("./sign-in");

    await startGoogleSignIn("/admin", { link: false });

    expect(signInWithOAuth).toHaveBeenCalled();
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("reduces an unsafe next to / before building redirectTo", async () => {
    const { startGoogleSignIn } = await import("./sign-in");

    await startGoogleSignIn("https://evil.example");

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=%2F` },
    });
  });

  it("never calls signInAnonymously", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    const { startGoogleSignIn } = await import("./sign-in");

    await startGoogleSignIn("/admin");
    await startGoogleSignIn("/admin", { link: false });

    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});
