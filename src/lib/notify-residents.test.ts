import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const sendZonePush = vi.fn();
vi.mock("@/lib/send-zone-push", () => ({ sendZonePush: (...args: unknown[]) => sendZonePush(...args) }));
const emailZone = vi.fn();
vi.mock("@/lib/email-alerts", () => ({ emailZone: (...args: unknown[]) => emailZone(...args) }));

let zone: { name: string } | null = { name: "Nilombot" };
let alert: { severity: string; message: { en: string; fil: string } } | null = null;
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const row = table === "zones" ? zone : alert;
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
      return chain;
    },
  }),
}));

import { alertChangeNotice, notifyResidentsOfAlertChange } from "./notify-residents";

beforeEach(() => {
  vi.clearAllMocks();
  zone = { name: "Nilombot" };
  alert = null;
  sendZonePush.mockResolvedValue({ ok: true, sent: 1, failed: 0, total: 1 });
  emailZone.mockResolvedValue({ ok: true, sent: 1, failed: 0 });
});

describe("alertChangeNotice", () => {
  it("names the barangay and the new level, with the official's words, in both languages by email", () => {
    const notice = alertChangeNotice("Nilombot", "set", {
      severity: "evacuate",
      message: { en: "Go to the school now.", fil: "Pumunta na sa paaralan." },
    });
    expect(notice.title).toBe("Nilombot: Evacuate Now");
    expect(notice.body).toBe("Go to the school now.");
    expect(notice.emailText).toContain("Pumunta na sa paaralan.");
    expect(notice.emailText).toContain("Lumikas Na para sa Nilombot");
  });

  it("says a rejected advisory was withdrawn, not that an alert was lifted (layer 9)", () => {
    expect(alertChangeNotice("Nilombot", "withdrawn", null).title).toBe("Nilombot: advisory withdrawn");
    expect(alertChangeNotice("Nilombot", "lifted", null).title).toBe("Nilombot: alert lifted");
  });
});

describe("notifyResidentsOfAlertChange", () => {
  it("pushes and emails the barangay's residents", async () => {
    alert = { severity: "red", message: { en: "Warning.", fil: "Babala." } };
    await notifyResidentsOfAlertChange("zone-1", "set");
    expect(sendZonePush).toHaveBeenCalledWith({ zoneId: "zone-1", title: "Nilombot: Warning", body: "Warning.", url: "/" });
    expect(emailZone).toHaveBeenCalledWith("zone-1", expect.objectContaining({ subject: "WeatherWell: Nilombot: Warning" }));
  });

  it("never throws: the alert is already saved", async () => {
    sendZonePush.mockRejectedValue(new Error("push service down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyResidentsOfAlertChange("zone-1", "lifted")).resolves.toBeUndefined();
    error.mockRestore();
  });
});
