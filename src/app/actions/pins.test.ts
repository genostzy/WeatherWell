import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, from }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const PIN_ID = "11111111-1111-4111-8111-111111111111";

const validPin = {
  id: PIN_ID,
  zoneId: "zone-1",
  statusTag: "flooded" as const,
  caption: "Market",
  lat: 16.06,
  lng: 120.4,
};

/**
 * postgrest-js's update path is a builder: `.update(...).eq(...).select(...)`,
 * and only the last link resolves. Every update test needs the whole chain, so
 * it is built once here and the individual spies handed back for assertions.
 */
function updateChain(result: { data?: { id: string }[] | null; error?: { code?: string; message: string } | null }) {
  const select = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  from.mockReturnValue({ update });
  return { update, eq, select };
}

describe("createPin", () => {
  it("treats a missing session as transient, so the queued pin is retried rather than binned", async () => {
    // Same reasoning as submitWaterLevelReport: a blocked cookie or a token
    // that expired while the device was offline resolves on a later attempt,
    // and permanent would make the drain skip it forever AND mergePins drop
    // it from the map.
    getClaims.mockResolvedValue({ data: { claims: undefined } });
    const { createPin } = await import("./pins");

    const result = await createPin(validPin);

    expect(result).toEqual({ ok: false, permanent: false, error: expect.any(String) });
  });

  it("attributes the pin to the uid from the verified claim, never to client input", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ insert });
    const { createPin } = await import("./pins");

    await createPin(validPin);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ author_id: "real-user" }));
  });

  it("inserts only the columns the schema still accepts", async () => {
    // photo_path, created_at, removed and removed_reason were revoked from
    // the resident's insert grant. Supplying any of them raises 42501, which
    // this file classifies permanent — so one stray column would silently bin
    // every pin the app files.
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ insert });
    const { createPin } = await import("./pins");

    await createPin(validPin);

    expect(Object.keys(insert.mock.calls[0][0]).sort()).toEqual(
      ["author_id", "caption", "id", "lat", "lng", "status_tag", "zone_id"].sort()
    );
  });

  it("treats a replayed pin that already landed as success", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    from.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }) });
    const { createPin } = await import("./pins");

    const result = await createPin(validPin);

    expect(result).toEqual({ ok: true });
  });

  it("rejects a caption longer than the limit without contacting the database", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    const { createPin } = await import("./pins");

    const result = await createPin({ ...validPin, caption: "x".repeat(281) });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a caption that is empty once trimmed", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    const { createPin } = await import("./pins");

    const result = await createPin({ ...validPin, caption: "   " });

    expect(result).toMatchObject({ ok: false, permanent: true });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a status tag outside the four the map can draw", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    const { createPin } = await import("./pins");

    const result = await createPin({ ...validPin, statusTag: "underwater" as never });

    expect(result).toMatchObject({ ok: false, permanent: true });
    expect(from).not.toHaveBeenCalled();
  });

  it("reports an RLS denial as permanent and an unknown error as transient", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });

    from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { code: "42501", message: "denied" } }),
    });
    const { createPin } = await import("./pins");
    expect(await createPin(validPin)).toMatchObject({ ok: false, permanent: true });

    from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { code: "08006", message: "connection reset" } }),
    });
    expect(await createPin(validPin)).toMatchObject({ ok: false, permanent: false });
  });
});

describe("editPin", () => {
  it("treats an update that changed no rows as a permanent refusal", async () => {
    // An UPDATE denied by RLS comes back as zero rows and NO error. Without
    // asking for the affected rows, the action would report success and the
    // outbox would markDelivered a write the database refused — the resident
    // sees their edit, reloads, and it is gone.
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    updateChain({ data: [] });
    const { editPin } = await import("./pins");

    const result = await editPin({ pinId: PIN_ID, statusTag: "receding", caption: "Fixed" });

    expect(result).toMatchObject({ ok: false, permanent: true });
  });

  it("updates only status_tag and caption, filtered by id alone", async () => {
    // RLS scopes the update to the author or an operator. Repeating that as an
    // author_id filter here is a second copy of the same rule, and the two
    // drift.
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    const { update, eq } = updateChain({ data: [{ id: PIN_ID }] });
    const { editPin } = await import("./pins");

    const result = await editPin({ pinId: PIN_ID, statusTag: "receding", caption: "Fixed" });

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ status_tag: "receding", caption: "Fixed" });
    expect(eq).toHaveBeenCalledWith("id", PIN_ID);
    expect(eq).toHaveBeenCalledTimes(1);
  });

  it("treats a missing session as transient rather than as a refused edit", async () => {
    // Without this check the update would run with no uid, RLS would match no
    // rows, and the zero-row branch above would bin the edit permanently.
    getClaims.mockResolvedValue({ data: { claims: undefined } });
    const { editPin } = await import("./pins");

    const result = await editPin({ pinId: PIN_ID, statusTag: "receding", caption: "Fixed" });

    expect(result).toMatchObject({ ok: false, permanent: false });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("deleteOwnPin", () => {
  it("writes removed and nothing else, because removed_reason is operator-only", async () => {
    // A BEFORE UPDATE trigger raises 42501 for a non-operator whenever
    // removed_reason changes at all. Setting it here would make a resident
    // withdrawing their own pin fail permanently — the outbox would bin it.
    // Leaving it NULL is also what it should mean: 'admin' and 'net_score'
    // both describe moderation, and this is the author's own choice.
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    const { update } = updateChain({ data: [{ id: PIN_ID }] });
    const { deleteOwnPin } = await import("./pins");

    const result = await deleteOwnPin({ pinId: PIN_ID });

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ removed: true });
  });

  it("treats a pin that is not the caller's as a permanent refusal", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    updateChain({ data: [] });
    const { deleteOwnPin } = await import("./pins");

    expect(await deleteOwnPin({ pinId: PIN_ID })).toMatchObject({ ok: false, permanent: true });
  });
});

describe("setPinRemoved", () => {
  it("stamps the reason when removing", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator" } } });
    const { update } = updateChain({ data: [{ id: PIN_ID }] });
    const { setPinRemoved } = await import("./pins");

    await setPinRemoved({ pinId: PIN_ID, removed: true, reason: "admin" });

    expect(update).toHaveBeenCalledWith({ removed: true, removed_reason: "admin" });
  });

  it("clears the reason when restoring, so a restored pin carries no stale verdict", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator" } } });
    const { update } = updateChain({ data: [{ id: PIN_ID }] });
    const { setPinRemoved } = await import("./pins");

    await setPinRemoved({ pinId: PIN_ID, removed: false, reason: "admin" });

    expect(update).toHaveBeenCalledWith({ removed: false, removed_reason: null });
  });

  it("treats a non-operator's refused moderation write as permanent", async () => {
    // is_operator() is what gates this. A resident whose client called it
    // gets zero rows (RLS) or 42501 (the trigger); neither becomes true later.
    getClaims.mockResolvedValue({ data: { claims: { sub: "resident" } } });
    updateChain({ data: [] });
    const { setPinRemoved } = await import("./pins");

    expect(await setPinRemoved({ pinId: PIN_ID, removed: true, reason: "admin" })).toMatchObject({
      ok: false,
      permanent: true,
    });
  });
});
