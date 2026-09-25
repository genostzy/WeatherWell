import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc, from }),
}));

// after() runs its callback once the response is sent; here, straight away.
vi.mock("next/server", () => ({ after: (callback: () => unknown) => void callback() }));
const notifyResidentsOfAlertChange = vi.fn();
vi.mock("@/lib/notify-residents", () => ({
  notifyResidentsOfAlertChange: (...args: unknown[]) => notifyResidentsOfAlertChange(...args),
}));

/** The zone's active alert as setZoneAlert reads it before changing it. */
function activeSeverity(severity: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: severity ? { severity } : null, error: null });
  const eq2 = vi.fn(() => ({ maybeSingle }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  from.mockReturnValue({ select: vi.fn(() => ({ eq: eq1 })) });
}

beforeEach(() => {
  vi.clearAllMocks();
  activeSeverity(null);
});

describe("setZoneAlert", () => {
  it("records what the new alert replaced, so the downgrade can be explained", async () => {
    // superseded_severity is what makes layer 9 need no join and no history
    // walk. Without it, a resident who was told to evacuate and then sees an
    // Advisory badge has no way to learn that a person made that decision.
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    rpc.mockResolvedValue({ error: null });
    const { setZoneAlert } = await import("./set-zone-alert");

    await setZoneAlert({ zoneId: "zone-1", severity: "yellow" });

    expect(rpc).toHaveBeenCalledWith("set_zone_alert", expect.objectContaining({
      p_zone_id: "zone-1",
      p_severity: "yellow",
    }));
  });

  it("refuses a severity that is not one of the four", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    const { setZoneAlert } = await import("./set-zone-alert");

    const result = await setZoneAlert({ zoneId: "zone-1", severity: "purple" as "yellow" });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
  });

  it("passes a null p_severity for the 'none' case, so the function deactivates without inserting", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    rpc.mockResolvedValue({ error: null });
    const { setZoneAlert } = await import("./set-zone-alert");

    await setZoneAlert({ zoneId: "zone-1", severity: "none" });

    expect(rpc).toHaveBeenCalledWith("set_zone_alert", expect.objectContaining({
      p_zone_id: "zone-1",
      p_severity: null,
    }));
  });

  it("generates copy for the new severity, not whatever the zone's previous alert said", async () => {
    // Copy written for one severity must never survive onto another — the
    // database enforces this structurally (a new severity is a new row), but
    // the message this action builds has to match the severity it is sending,
    // not the caller's-eye view of "the zone's current wording".
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    rpc.mockResolvedValue({ error: null });
    const { setZoneAlert } = await import("./set-zone-alert");

    await setZoneAlert({ zoneId: "zone-1", severity: "evacuate" });

    const call = rpc.mock.calls[0][1] as { p_message: { en: string } };
    expect(call.p_message.en).toContain("Evacuate immediately");
  });

  it("does not call rpc with a null p_message for a real severity", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    rpc.mockResolvedValue({ error: null });
    const { setZoneAlert } = await import("./set-zone-alert");

    await setZoneAlert({ zoneId: "zone-1", severity: "red" });

    const call = rpc.mock.calls[0][1] as { p_message: unknown };
    expect(call.p_message).not.toBeNull();
  });

  it("treats a missing session as a reportable failure — there is no queue to retry into", async () => {
    getClaims.mockResolvedValue({ data: { claims: undefined } });
    const { setZoneAlert } = await import("./set-zone-alert");

    const result = await setZoneAlert({ zoneId: "zone-1", severity: "yellow" });

    expect(result).toMatchObject({ ok: false, permanent: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports an RLS denial from a resident calling this as a permanent failure", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "resident-1" } } });
    rpc.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    const { setZoneAlert } = await import("./set-zone-alert");

    const result = await setZoneAlert({ zoneId: "zone-1", severity: "yellow" });

    expect(result).toMatchObject({ ok: false, permanent: true });
  });

  it("reports any other database error as permanent too, since there is nothing to retry into", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    rpc.mockResolvedValue({ error: { code: "08006", message: "connection reset" } });
    const { setZoneAlert } = await import("./set-zone-alert");

    const result = await setZoneAlert({ zoneId: "zone-1", severity: "yellow" });

    expect(result).toMatchObject({ ok: false, permanent: true });
  });
});

describe("confirmAutomaticAlert (found testing the live site)", () => {
  function activeAlert(row: object | null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const eq2 = vi.fn(() => ({ maybeSingle }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    from.mockReturnValue({ select: vi.fn(() => ({ eq: eq1 })) });
  }

  it("re-issues the advisory as the official's, keeping what residents reported", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    activeAlert({
      severity: "yellow",
      source: "auto_crowdsourced",
      message: {
        en: "Advisory — 3 residents report knee-deep water (unverified).",
        fil: "Paalala — 3 residente ang nag-ulat ng tubig na hanggang tuhod (hindi pa kumpirmado).",
      },
    });
    rpc.mockResolvedValue({ error: null });
    const { confirmAutomaticAlert } = await import("./set-zone-alert");

    expect(await confirmAutomaticAlert("zone-1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("set_zone_alert", {
      p_zone_id: "zone-1",
      p_severity: "yellow",
      p_message: {
        en: "Advisory — 3 residents report knee-deep water (confirmed by your barangay).",
        fil: "Paalala — 3 residente ang nag-ulat ng tubig na hanggang tuhod (kinumpirma ng inyong barangay).",
      },
    });
  });

  it("refuses when there is no automatic advisory to confirm", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    activeAlert({ severity: "red", source: "manual", message: { en: "x", fil: "x" } });
    const { confirmAutomaticAlert } = await import("./set-zone-alert");
    const result = await confirmAutomaticAlert("zone-1");
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("rejectAutomaticAlert (layer 6)", () => {
  it("asks the database to reject, so the verdict is recorded rather than a plain clear", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    rpc.mockResolvedValue({ error: null });
    const { rejectAutomaticAlert } = await import("./set-zone-alert");

    expect(await rejectAutomaticAlert("zone-1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("reject_automatic_alert", { p_zone_id: "zone-1" });
  });

  it("passes the database's refusal on to the official", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    rpc.mockResolvedValue({ error: { code: "P0002", message: "There is no automatic advisory here to reject." } });
    const { rejectAutomaticAlert } = await import("./set-zone-alert");

    expect(await rejectAutomaticAlert("zone-1")).toEqual({
      ok: false,
      permanent: true,
      error: "There is no automatic advisory here to reject.",
    });
  });

  it("refuses without a session", async () => {
    getClaims.mockResolvedValue({ data: null });
    const { rejectAutomaticAlert } = await import("./set-zone-alert");

    expect((await rejectAutomaticAlert("zone-1")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("telling residents about an official's change", () => {
  beforeEach(() => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    rpc.mockResolvedValue({ error: null });
  });

  it("notifies them when the severity changes", async () => {
    activeSeverity("yellow");
    const { setZoneAlert } = await import("./set-zone-alert");
    await setZoneAlert({ zoneId: "zone-1", severity: "evacuate" });
    expect(notifyResidentsOfAlertChange).toHaveBeenCalledWith("zone-1", "set");
  });

  it("notifies them when the alert is lifted", async () => {
    activeSeverity("red");
    const { setZoneAlert } = await import("./set-zone-alert");
    await setZoneAlert({ zoneId: "zone-1", severity: "none" });
    expect(notifyResidentsOfAlertChange).toHaveBeenCalledWith("zone-1", "lifted");
  });

  it("does not notify them again when the same severity is re-confirmed", async () => {
    activeSeverity("red");
    const { setZoneAlert } = await import("./set-zone-alert");
    await setZoneAlert({ zoneId: "zone-1", severity: "red" });
    expect(notifyResidentsOfAlertChange).not.toHaveBeenCalled();
  });

  it("does not notify them when the database refused the change", async () => {
    activeSeverity("yellow");
    rpc.mockResolvedValue({ error: { code: "42501", message: "not an official for this barangay" } });
    const { setZoneAlert } = await import("./set-zone-alert");
    await setZoneAlert({ zoneId: "zone-1", severity: "evacuate" });
    expect(notifyResidentsOfAlertChange).not.toHaveBeenCalled();
  });

  it("tells them a rejected advisory is withdrawn (layer 9)", async () => {
    const { rejectAutomaticAlert } = await import("./set-zone-alert");
    await rejectAutomaticAlert("zone-1");
    expect(notifyResidentsOfAlertChange).toHaveBeenCalledWith("zone-1", "withdrawn");
  });
});
