import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, from }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * postgrest-js's update path is a builder: `.update(...).eq(...).select(...)`,
 * and only the last link resolves. Every update test needs the whole chain, so
 * it is built once here and the individual spies handed back for assertions.
 * Same shape pins.test.ts uses for the same reason.
 */
function updateChain(result: { data?: { zone_id: string }[] | null; error?: { code?: string; message: string } | null }) {
  const select = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  from.mockReturnValue({ update });
  return { update, eq, select };
}

describe("setCenterStatus", () => {
  it("updates status filtered by zone_id", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    const { update, eq } = updateChain({ data: [{ zone_id: "zone-1" }] });
    const { setCenterStatus } = await import("./set-center");

    const result = await setCenterStatus({ zoneId: "zone-1", status: "full" });

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ status: "full" });
    expect(eq).toHaveBeenCalledWith("zone_id", "zone-1");
  });

  it("rejects a status outside the three the schema accepts, without touching the database", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    const { setCenterStatus } = await import("./set-center");

    const result = await setCenterStatus({ zoneId: "zone-1", status: "overflowing" as "full" });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
    expect(from).not.toHaveBeenCalled();
  });

  it("treats zero affected rows as a permanent refusal — a resident calling this must not be told it worked", async () => {
    // centers_update_in_area refuses an out-of-area UPDATE by matching zero
    // rows and raising no error. Without asking for the affected rows, this
    // would report success to a resident whose write RLS actually discarded.
    getClaims.mockResolvedValue({ data: { claims: { sub: "resident-1" } } });
    updateChain({ data: [] });
    const { setCenterStatus } = await import("./set-center");

    const result = await setCenterStatus({ zoneId: "zone-1", status: "full" });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
  });

  it("treats a missing session as a reportable failure — there is no queue to retry into", async () => {
    getClaims.mockResolvedValue({ data: { claims: undefined } });
    const { setCenterStatus } = await import("./set-center");

    const result = await setCenterStatus({ zoneId: "zone-1", status: "full" });

    expect(result).toMatchObject({ ok: false, permanent: true });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("setCenterOccupancy", () => {
  it("updates current_occupancy filtered by zone_id", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    const { update, eq } = updateChain({ data: [{ zone_id: "zone-1" }] });
    const { setCenterOccupancy } = await import("./set-center");

    const result = await setCenterOccupancy({ zoneId: "zone-1", occupancy: 42 });

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ current_occupancy: 42 });
    expect(eq).toHaveBeenCalledWith("zone_id", "zone-1");
  });

  it("clears the headcount when occupancy is null", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    const { update } = updateChain({ data: [{ zone_id: "zone-1" }] });
    const { setCenterOccupancy } = await import("./set-center");

    await setCenterOccupancy({ zoneId: "zone-1", occupancy: null });

    expect(update).toHaveBeenCalledWith({ current_occupancy: null });
  });

  it("rejects a negative occupancy without touching the database", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    const { setCenterOccupancy } = await import("./set-center");

    const result = await setCenterOccupancy({ zoneId: "zone-1", occupancy: -1 });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a non-integer occupancy without touching the database", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    const { setCenterOccupancy } = await import("./set-center");

    const result = await setCenterOccupancy({ zoneId: "zone-1", occupancy: 4.5 });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
    expect(from).not.toHaveBeenCalled();
  });

  it("treats zero affected rows as a permanent refusal — a resident calling this must not be told it worked", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "resident-1" } } });
    updateChain({ data: [] });
    const { setCenterOccupancy } = await import("./set-center");

    const result = await setCenterOccupancy({ zoneId: "zone-1", occupancy: 10 });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
  });

  it("treats a missing session as a reportable failure — there is no queue to retry into", async () => {
    getClaims.mockResolvedValue({ data: { claims: undefined } });
    const { setCenterOccupancy } = await import("./set-center");

    const result = await setCenterOccupancy({ zoneId: "zone-1", occupancy: 10 });

    expect(result).toMatchObject({ ok: false, permanent: true });
    expect(from).not.toHaveBeenCalled();
  });
});
