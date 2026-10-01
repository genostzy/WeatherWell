import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/send-zone-push", () => ({ sendUsersPush: vi.fn() }));
vi.mock("@/lib/email-alerts", () => ({ emailUsers: vi.fn() }));

/** Records every filter a query makes, and answers maybeSingle with what the test set. */
const filters: unknown[][] = [];
let answer: { data: unknown } = { data: null };
const query: Record<string, unknown> = {};
for (const name of ["select", "eq", "gte", "order", "limit"]) {
  query[name] = (...args: unknown[]) => {
    filters.push([name, ...args]);
    return query;
  };
}
query.maybeSingle = async () => answer;
const from = vi.fn(() => query);
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from }) }));

import { notifyDownstreamOfficials } from "./notify-officials";

beforeEach(() => {
  filters.length = 0;
  answer = { data: null };
  from.mockClear();
});

describe("notifyDownstreamOfficials", () => {
  it("finds the heads-up this barangay's alert left, not another upstream barangay's", async () => {
    await notifyDownstreamOfficials("zone-a");
    expect(from).toHaveBeenCalledWith("official_messages");
    expect(filters).toContainEqual(["eq", "direction", "heads_up"]);
    expect(filters).toContainEqual(["eq", "from_zone_id", "zone-a"]);
  });

  it("does nothing when there is no heads-up, and never throws", async () => {
    await expect(notifyDownstreamOfficials("zone-a")).resolves.toBeUndefined();
    from.mockImplementationOnce(() => {
      throw new Error("down");
    });
    await expect(notifyDownstreamOfficials("zone-a")).resolves.toBeUndefined();
  });
});
