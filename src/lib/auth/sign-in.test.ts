import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const linkIdentity = vi.fn();
const signInWithOAuth = vi.fn();
const signInAnonymously = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const updateUser = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    auth: {
      getSession,
      linkIdentity,
      signInWithOAuth,
      signInAnonymously,
      signInWithPassword,
      signUp,
      updateUser,
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: null } });
  linkIdentity.mockResolvedValue({ error: null });
  signInWithOAuth.mockResolvedValue({ error: null });
  signInWithPassword.mockResolvedValue({ error: null });
  signUp.mockResolvedValue({ error: null });
  updateUser.mockResolvedValue({ error: null });
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

describe("signInWithPassword", () => {
  it("signs in with the given email and password", async () => {
    const { signInWithPassword: signIn } = await import("./sign-in");

    const result = await signIn("official@example.com", "hunter22");

    expect(signInWithPassword).toHaveBeenCalledWith({ email: "official@example.com", password: "hunter22" });
    expect(result).toEqual({ ok: true });
  });

  it("surfaces a failed sign-in as an error result", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const { signInWithPassword: signIn } = await import("./sign-in");

    const result = await signIn("official@example.com", "wrong");

    expect(result).toEqual({ ok: false, error: "Invalid login credentials" });
  });
});

describe("signUpWithPassword", () => {
  it("attaches the password to an existing anonymous session via updateUser, rather than starting a new account", async () => {
    // Mirrors sendEmailSignInLink's linking rule: a resident who already has
    // anonymous history (reports, pins) must not lose it to a fresh signUp.
    getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    const { signUpWithPassword } = await import("./sign-in");

    const result = await signUpWithPassword("resident@example.com", "hunter22");

    expect(updateUser).toHaveBeenCalledWith({ email: "resident@example.com", password: "hunter22" });
    expect(signUp).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("signs up fresh when there is no anonymous session to preserve", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { signUpWithPassword } = await import("./sign-in");

    const result = await signUpWithPassword("official@example.com", "hunter22");

    expect(signUp).toHaveBeenCalledWith({ email: "official@example.com", password: "hunter22" });
    expect(updateUser).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("refuses to fall back to a fresh signUp when linking fails because the email is taken (would abandon this phone's history)", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    updateUser.mockResolvedValue({
      error: { code: "email_exists", message: "A user with this email address has already been registered" },
    });
    const { signUpWithPassword } = await import("./sign-in");

    const result = await signUpWithPassword("resident@example.com", "hunter22");

    expect(signUp).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("surfaces any other linking error as a failure instead of silently starting a new account", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    updateUser.mockResolvedValue({ error: { code: "over_email_send_rate_limit", message: "Email rate limit exceeded" } });
    const { signUpWithPassword } = await import("./sign-in");

    const result = await signUpWithPassword("resident@example.com", "hunter22");

    expect(signUp).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Email rate limit exceeded" });
  });
});
