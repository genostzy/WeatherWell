import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { POST } from "./route";

const TOKEN = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
});

describe("POST /api/email/unsubscribe", () => {
  it("removes the subscription the token belongs to, then shows the done page", async () => {
    const response = await POST(new Request(`https://weatherwell.test/api/email/unsubscribe?token=${TOKEN}`, { method: "POST" }));
    expect(rpc).toHaveBeenCalledWith("unsubscribe_email_alerts", { p_token: TOKEN });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://weatherwell.test/unsubscribe?done=1");
  });

  it("refuses a link without a real token", async () => {
    const response = await POST(new Request("https://weatherwell.test/api/email/unsubscribe?token=abc", { method: "POST" }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not claim success when the database fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    const response = await POST(new Request(`https://weatherwell.test/api/email/unsubscribe?token=${TOKEN}`, { method: "POST" }));
    expect(response.status).toBe(502);
  });
});
