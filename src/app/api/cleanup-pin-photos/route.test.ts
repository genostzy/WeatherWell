import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The route imports @/lib/cron-auth, which does `import "server-only"`.
vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const remove = vi.fn();
const inFn = vi.fn();
const update = vi.fn(() => ({ in: inFn }));
const from = vi.fn(() => ({ update }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc, from, storage: { from: () => ({ remove }) } }),
}));

import { GET } from "./route";

function request(authorization?: string): Request {
  return new Request("https://weatherwell.app/api/cleanup-pin-photos", {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/cleanup-pin-photos", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    remove.mockResolvedValue({ error: null });
    inFn.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("refuses without the cron secret, and lists nothing", async () => {
    expect((await GET(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("deletes the listed photos and clears them from their pins", async () => {
    rpc.mockResolvedValue({ data: [{ path: "u1/a.jpg" }, { path: "u1/b.jpg" }], error: null });
    const response = await GET(request("Bearer test-secret"));
    expect(rpc).toHaveBeenCalledWith("pin_photos_to_delete");
    expect(remove).toHaveBeenCalledWith(["u1/a.jpg", "u1/b.jpg"]);
    expect(from).toHaveBeenCalledWith("community_pins");
    expect(update).toHaveBeenCalledWith({ photo_path: null });
    expect(inFn).toHaveBeenCalledWith("photo_path", ["u1/a.jpg", "u1/b.jpg"]);
    expect(await response.json()).toEqual({ deleted: 2 });
  });

  it("does nothing when nothing is due", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const response = await GET(request("Bearer test-secret"));
    expect(remove).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ deleted: 0 });
  });

  it("deletes in batches of 100", async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 150 }, (_, i) => ({ path: `u1/${i}.jpg` })), error: null });
    await GET(request("Bearer test-secret"));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls[0][0]).toHaveLength(100);
  });

  it("is a 502 when the list can't be read", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await GET(request("Bearer test-secret"))).status).toBe(502);
  });
});
