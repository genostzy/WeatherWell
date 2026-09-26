import { describe, it, expect, vi, beforeEach } from "vitest";

const row = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    from: () => ({ select: () => ({ maybeSingle: () => row() }) }),
  }),
}));
const subscribeEmailAlerts = vi.fn(async (zoneId: string) => ({ ok: true, zoneId }));
vi.mock("@/app/actions/email-alerts", () => ({ subscribeEmailAlerts: (zoneId: string) => subscribeEmailAlerts(zoneId) }));

import { followEmailAlerts } from "./follow-email-alerts";

beforeEach(() => vi.clearAllMocks());

describe("followEmailAlerts (email alerts follow my barangay)", () => {
  it("moves email alerts to the new barangay", async () => {
    row.mockResolvedValue({ data: { zone_id: "zone-1" }, error: null });
    await followEmailAlerts("zone-2");
    expect(subscribeEmailAlerts).toHaveBeenCalledTimes(1);
    expect(subscribeEmailAlerts).toHaveBeenCalledWith("zone-2");
  });

  it("does nothing without email alerts", async () => {
    row.mockResolvedValue({ data: null, error: null });
    await followEmailAlerts("zone-2");
    expect(subscribeEmailAlerts).not.toHaveBeenCalled();
  });

  it("does nothing when they already follow it", async () => {
    row.mockResolvedValue({ data: { zone_id: "zone-2" }, error: null });
    await followEmailAlerts("zone-2");
    expect(subscribeEmailAlerts).not.toHaveBeenCalled();
  });
});
