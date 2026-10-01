import { describe, it, expect, vi, beforeEach } from "vitest";

/** What each table and function answers for the signed-in resident in a test. */
let tables: Record<string, unknown[]> = {};
let rpcs: Record<string, unknown[]> = {};
let user: Record<string, unknown> | null = null;
const eqCalls: [string, string, unknown][] = [];

function from(table: string) {
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      eqCalls.push([table, column, value]);
      return query;
    },
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: tables[table] ?? [], error: null }),
  };
  return query;
}
const rpc = vi.fn(async (name: string) => ({ data: rpcs[name] ?? [], error: null }));
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: "no session" } }) },
    from,
    rpc,
  }),
}));

import { GET } from "./route";

const ME = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  tables = {};
  rpcs = {};
  eqCalls.length = 0;
  user = { id: ME, created_at: "2026-09-01T00:00:00Z", is_anonymous: false, email: "me@example.com" };
});

describe("GET /api/my-data", () => {
  it("is a 401 without a session", async () => {
    user = null;
    expect((await GET()).status).toBe(401);
  });

  it("hands back everything about the resident, as a file never cached", async () => {
    tables = {
      profiles: [{ zone_id: "zone-1" }],
      community_pins: [
        { id: "p1", zone_id: "zone-1", status_tag: "flooded", caption: "Knee deep", lat: 16, lng: 120, created_at: "t1", photo_path: "me/a.jpg" },
      ],
      pin_votes: [{ pin_id: "p9", direction: 1, voted_at: "t2" }],
      evacuation_check_ins: [{ zone_id: "zone-1", status: "safe", checked_in_at: "t3" }],
      push_subscriptions: [{ zone_id: "zone-1", created_at: "t4", endpoint: "https://push", p256dh: "k", auth: "a" }],
      email_alert_subscriptions: [{ zone_id: null, created_at: "t5", unsubscribe_token: "secret" }],
    };
    rpcs = {
      my_water_level_reports: [{ id: "r1", zone_id: "zone-1", depth_level: "knee", reported_at: "t6" }],
      my_report_positions: [{ id: "r1", lat: 16.02, lng: 120.45 }],
      my_recovery_questions: [{ question_1: "First pet?", question_2: "Street?" }],
    };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="weatherwell-my-data.json"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      exportedAt: expect.any(String),
      account: { id: ME, createdAt: "2026-09-01T00:00:00Z", anonymous: false, email: "me@example.com" },
      barangay: "zone-1",
      reports: [{ id: "r1", zoneId: "zone-1", depthLevel: "knee", reportedAt: "t6", lat: 16.02, lng: 120.45 }],
      pins: [{ id: "p1", zoneId: "zone-1", statusTag: "flooded", caption: "Knee deep", lat: 16, lng: 120, createdAt: "t1", hadPhoto: true }],
      votes: [{ pinId: "p9", direction: 1, votedAt: "t2" }],
      checkIns: [{ zoneId: "zone-1", status: "safe", checkedInAt: "t3" }],
      alerts: { push: [{ zoneId: "zone-1", since: "t4" }], email: [{ zoneId: null, since: "t5" }] },
      securityQuestions: ["First pet?", "Street?"],
    });
    // Each table is read for this resident only.
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ["profiles", "id", ME],
        ["community_pins", "author_id", ME],
        ["pin_votes", "voter_id", ME],
        ["evacuation_check_ins", "user_id", ME],
        ["push_subscriptions", "user_id", ME],
        ["email_alert_subscriptions", "user_id", ME],
      ])
    );
  });

  it("gives every section, empty, for an account with nothing", async () => {
    user = { id: ME, created_at: "2026-09-01T00:00:00Z", is_anonymous: true };
    const body = await (await GET()).json();
    expect(body).toEqual({
      exportedAt: expect.any(String),
      account: { id: ME, createdAt: "2026-09-01T00:00:00Z", anonymous: true, email: null },
      barangay: null,
      reports: [],
      pins: [],
      votes: [],
      checkIns: [],
      alerts: { push: [], email: [] },
      securityQuestions: [],
    });
  });
});
