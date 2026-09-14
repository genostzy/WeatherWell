import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { exchangeCodeForSession } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const ORIGIN = "https://weatherwell.test";

describe("GET /auth/callback", () => {
  it("exchanges a valid code and redirects to next", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const response = await GET(new NextRequest(`${ORIGIN}/auth/callback?code=abc&next=/admin`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin`);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("redirects to /sign-in with a failed notice when the provider reports an error", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest(`${ORIGIN}/auth/callback?error=access_denied&next=/admin`)
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Fadmin&notice=failed`);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in with a failed notice when the exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad code" } });
    const { GET } = await import("./route");

    const response = await GET(new NextRequest(`${ORIGIN}/auth/callback?code=abc&next=/admin`));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Fadmin&notice=failed`);
  });

  it("reduces an unsafe next to / before using it anywhere in the response", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest(`${ORIGIN}/auth/callback?code=abc&next=https://evil.example`)
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });

  it("carries Cache-Control: no-store on every response", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const success = await GET(new NextRequest(`${ORIGIN}/auth/callback?code=abc&next=/admin`));
    expect(success.headers.get("Cache-Control")).toBe("no-store");

    const failure = await GET(new NextRequest(`${ORIGIN}/auth/callback?error=denied`));
    expect(failure.headers.get("Cache-Control")).toBe("no-store");
  });
});
