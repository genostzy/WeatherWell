import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The route imports @/lib/cron-auth, which does `import "server-only"` —
// that throws unconditionally under Vitest (see load-official.test.ts).
vi.mock("server-only", () => ({}));

const { parseBulletinHtml } = vi.hoisted(() => ({ parseBulletinHtml: vi.fn() }));

vi.mock("@/lib/pagasa-parser", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pagasa-parser")>("@/lib/pagasa-parser");
  return { ...actual, parseBulletinHtml };
});

const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
const insert = vi.fn();
const single = vi.fn();
const limit = vi.fn(() => ({ single }));
const selectEq2 = vi.fn(() => ({ limit }));
const selectEq1 = vi.fn(() => ({ eq: selectEq2 }));
const select = vi.fn(() => ({ eq: selectEq1 }));
const from = vi.fn(() => ({ update, insert, select }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from }),
}));

import { GET } from "./route";
import { BulletinParseError } from "@/lib/pagasa-parser";

function request(authorization?: string): Request {
  return new Request("https://weatherwell.app/api/cron/typhoon", {
    headers: authorization ? { authorization } : {},
  });
}

const HTML = "x".repeat(600);

describe("GET /api/cron/typhoon", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => HTML });
    eq.mockResolvedValue({ error: null });
    single.mockResolvedValue({ data: null });
    insert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    global.fetch = originalFetch;
  });

  it("refuses a request with no cron secret, and never fetches the bulletin", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("deactivates all tracks when there is genuinely no active cyclone", async () => {
    parseBulletinHtml.mockReturnValue(null);

    const response = await GET(request("Bearer test-secret"));
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.action).toBe("deactivated_all");
    expect(from).toHaveBeenCalledWith("typhoon_tracks");
    expect(update).toHaveBeenCalledWith({ is_active: false });
  });

  /**
   * The actual bug this guards: a BulletinParseError (PAGASA's page
   * structure changed) used to fall into the generic catch block, which
   * returns HTTP 500 without touching typhoon_tracks — leaving a
   * previously-active, possibly long-resolved system marked active
   * forever. It must be treated the same as "no active cyclone found":
   * deactivate, and report ok so the cron doesn't look like it's failing
   * every single day a bulletin's markup shifts.
   */
  it("deactivates all tracks (rather than 500ing and leaving stale data active) when the parser can't read a changed page structure", async () => {
    parseBulletinHtml.mockImplementation(() => {
      throw new BulletinParseError("cannot extract bulletin number");
    });

    const response = await GET(request("Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.action).toBe("deactivated_all");
    expect(body.parseError).toContain("cannot extract bulletin number");
    expect(update).toHaveBeenCalledWith({ is_active: false });
  });

  it("still 500s on a genuinely unexpected error, not a parse error", async () => {
    parseBulletinHtml.mockImplementation(() => {
      throw new Error("boom");
    });

    const response = await GET(request("Bearer test-secret"));

    expect(response.status).toBe(500);
  });

  it("stores a newly parsed bulletin", async () => {
    parseBulletinHtml.mockReturnValue({
      source: "html",
      bulletinNumber: 5,
      isFinal: false,
      pagasaName: "AGATON",
      internationalName: null,
      category: "TS",
      categoryRaw: "Tropical Storm",
      issuedAt: "2026-09-21T05:00:00+08:00",
      nextBulletinAt: null,
      headline: null,
      center: null,
      maxWindsKph: 65,
      gustinessKph: 80,
      pressureHpa: 995,
      movementDirection: "West",
      movementSpeedKph: 15,
      signals: [],
    });

    const response = await GET(request("Bearer test-secret"));
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.name).toBe("AGATON");
    expect(insert).toHaveBeenCalled();
  });
});
