import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
const runRainForecast = vi.fn();
vi.mock("@/lib/rain-forecast", () => ({ runRainForecast: () => runRainForecast() }));

import { GET } from "./route";

const request = (authorization?: string) =>
  new Request("https://weatherwell.app/api/rain-forecast", { headers: authorization ? { authorization } : {} });

describe("GET /api/rain-forecast", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });

  it("refuses without the cron secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect(runRainForecast).not.toHaveBeenCalled();
  });

  it("answers with the run's result", async () => {
    runRainForecast.mockResolvedValue({ checked: 15, raised: ["zone-1"], ended: 0 });
    const res = await GET(request("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 15, raised: ["zone-1"], ended: 0 });
  });

  it("fails loudly when the run fails", async () => {
    runRainForecast.mockRejectedValue(new Error("Open-Meteo answered 500"));
    const res = await GET(request("Bearer test-secret"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Open-Meteo answered 500" });
  });
});
