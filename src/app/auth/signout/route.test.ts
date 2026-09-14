import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getClaims = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims, signOut } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const ORIGIN = "https://weatherwell.test";

function postRequest(next?: string) {
  const form = new FormData();
  if (next !== undefined) form.set("next", next);
  return new NextRequest(`${ORIGIN}/auth/signout`, { method: "POST", body: form });
}

describe("POST /auth/signout", () => {
  it("signs out and redirects to the form's next when claims exist", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    const { POST } = await import("./route");

    const response = await POST(postRequest("/admin"));

    expect(signOut).toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin`);
  });

  it("does not call signOut when there are no claims", async () => {
    getClaims.mockResolvedValue({ data: null });
    const { POST } = await import("./route");

    await POST(postRequest("/admin"));

    expect(signOut).not.toHaveBeenCalled();
  });

  it("defaults next to / when the form carries none", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    const { POST } = await import("./route");

    const response = await POST(postRequest());

    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });

  it("reduces an unsafe next to / via safeNext", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    const { POST } = await import("./route");

    const response = await POST(postRequest("https://evil.example"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });
});
