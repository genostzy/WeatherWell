import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The route imports @/lib/cron-auth, which does `import "server-only"` —
// that throws unconditionally under Vitest (see load-official.test.ts).
vi.mock("server-only", () => ({}));

const lt = vi.fn();
const deleteFn = vi.fn(() => ({ lt }));
const from = vi.fn(() => ({ delete: deleteFn }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from }),
}));

import { GET } from "./route";

function request(authorization?: string): Request {
  return new Request("https://weatherwell.app/api/cleanup-weather", {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/cleanup-weather", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    lt.mockResolvedValue({ count: 12, error: null });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("refuses a request with no cron secret, and never touches the database", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a request with the wrong secret", async () => {
    const response = await GET(request("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("runs the bulk delete for a correctly authorized cron request", async () => {
    const response = await GET(request("Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("weather_readings");
    expect(body.deleted).toBe(12);
  });
});
