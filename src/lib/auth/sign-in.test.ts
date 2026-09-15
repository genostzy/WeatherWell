import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const linkIdentity = vi.fn();
const signInWithOAuth = vi.fn();
const updateUser = vi.fn();
const signInWithOtp = vi.fn();
const signInAnonymously = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    auth: { getSession, linkIdentity, signInWithOAuth, updateUser, signInWithOtp, signInAnonymously },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: null } });
  linkIdentity.mockResolvedValue({ error: null });
  signInWithOAuth.mockResolvedValue({ error: null });
  updateUser.mockResolvedValue({ error: null });
  signInWithOtp.mockResolvedValue({ error: null });
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

describe("sendEmailSignInLink", () => {
  it("links an email to an existing anonymous session via updateUser", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    const { sendEmailSignInLink } = await import("./sign-in");

    await sendEmailSignInLink("resident@example.com", "/admin");

    expect(updateUser).toHaveBeenCalledWith(
      { email: "resident@example.com" },
      { emailRedirectTo: `${origin}/auth/confirm?next=%2Fadmin` }
    );
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("falls back to signInWithOtp when updateUser errors (the email already belongs to another account)", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    // The error Supabase Auth actually returns for this case (M11): the
    // fallback keys on the code, so the fixture carries it.
    updateUser.mockResolvedValue({
      error: { code: "email_exists", message: "A user with this email address has already been registered" },
    });
    const { sendEmailSignInLink } = await import("./sign-in");

    await sendEmailSignInLink("resident@example.com", "/admin");

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "resident@example.com",
      options: { emailRedirectTo: `${origin}/auth/confirm?next=%2Fadmin`, shouldCreateUser: true },
    });
  });

  it("surfaces any other updateUser error as a failure instead of signing into a different account (M11)", async () => {
    // A transient failure must not quietly abandon the resident's anonymous
    // history by signing them into a new or other account.
    getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    updateUser.mockResolvedValue({ error: { code: "over_email_send_rate_limit", message: "Email rate limit exceeded" } });
    const { sendEmailSignInLink } = await import("./sign-in");

    const result = await sendEmailSignInLink("resident@example.com", "/admin");

    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Email rate limit exceeded" });
  });

  it("surfaces an updateUser error that carries no code at all as a failure (M11)", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    updateUser.mockResolvedValue({ error: { message: "Failed to fetch" } });
    const { sendEmailSignInLink } = await import("./sign-in");

    const result = await sendEmailSignInLink("resident@example.com", "/admin");

    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Failed to fetch" });
  });

  it("calls signInWithOtp directly when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { sendEmailSignInLink } = await import("./sign-in");

    await sendEmailSignInLink("resident@example.com", "/admin");

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "resident@example.com",
      options: { emailRedirectTo: `${origin}/auth/confirm?next=%2Fadmin`, shouldCreateUser: true },
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("never calls signInAnonymously", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { sendEmailSignInLink } = await import("./sign-in");

    await sendEmailSignInLink("resident@example.com", "/admin");

    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});
