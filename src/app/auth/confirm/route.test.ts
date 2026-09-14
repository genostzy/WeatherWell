import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const verifyOtp = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { verifyOtp } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const ORIGIN = "https://weatherwell.test";

describe("GET /auth/confirm", () => {
  it("verifies a token_hash of type email and redirects to next", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest(`${ORIGIN}/auth/confirm?token_hash=t&type=email&next=/admin`)
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin`);
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "t" });
  });

  it("accepts type=email_change", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest(`${ORIGIN}/auth/confirm?token_hash=t&type=email_change&next=/admin`)
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin`);
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email_change", token_hash: "t" });
  });

  it("refuses any other type and never calls verifyOtp", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest(`${ORIGIN}/auth/confirm?token_hash=t&type=recovery&next=/admin`)
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Fadmin&notice=failed`);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in with a failed notice when verifyOtp errors", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest(`${ORIGIN}/auth/confirm?token_hash=t&type=email&next=/admin`)
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Fadmin&notice=failed`);
  });

  it("reduces an unsafe next to / before using it anywhere in the response", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest(`${ORIGIN}/auth/confirm?token_hash=t&type=email&next=https://evil.example`)
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });

  it("carries Cache-Control: no-store on every response", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const success = await GET(
      new NextRequest(`${ORIGIN}/auth/confirm?token_hash=t&type=email&next=/admin`)
    );
    expect(success.headers.get("Cache-Control")).toBe("no-store");

    const failure = await GET(new NextRequest(`${ORIGIN}/auth/confirm?type=recovery`));
    expect(failure.headers.get("Cache-Control")).toBe("no-store");
  });
});
