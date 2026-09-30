import { describe, it, expect } from "vitest";
import { entryStatusText } from "./outbox-copy";
import type { OutboxEntry } from "@/lib/outbox/types";
import type { Zone } from "@/lib/types";

const zones = [{ id: "z1", name: "Poblacion" }] as Zone[];

function entry(over: Partial<OutboxEntry>): OutboxEntry {
  return {
    id: "e1",
    operation: "createPin",
    payload: { zoneId: "z1" } as OutboxEntry["payload"],
    queuedAt: "2026-09-30T00:00:00Z",
    attempts: 1,
    status: "pending",
    nextAttemptAt: null,
    updatedAt: "2026-09-30T00:00:00Z",
    ...over,
  };
}

describe("outbox copy for the pin and vote limits", () => {
  it("a pin waiting for the hour says up to 5 pins an hour", () => {
    const waiting = entry({ waitReason: "rate_limited" });
    expect(entryStatusText(waiting, "en", zones)).toBe("Waiting: up to 5 pins an hour. It will send by itself.");
    expect(entryStatusText(waiting, "fil", zones)).toBe("Naghihintay: hanggang 5 pin bawat oras. Kusa itong maipapadala.");
  });

  it("a vote waiting for the hour says up to 30 votes an hour", () => {
    const waiting = entry({ operation: "voteOnPin", payload: { pinId: "p1", direction: 1 }, waitReason: "rate_limited" });
    expect(entryStatusText(waiting, "en", zones)).toBe("Waiting: up to 30 votes an hour. It will send by itself.");
    expect(entryStatusText(waiting, "fil", zones)).toBe("Naghihintay: hanggang 30 boto bawat oras. Kusa itong maipapadala.");
  });

  it("a pin too far from its barangay names the barangay", () => {
    const stuck = entry({ status: "stuck", stuckReason: "too_far" });
    expect(entryStatusText(stuck, "en", zones)).toBe("Couldn't send: This spot is too far from Poblacion to pin there.");
    expect(entryStatusText(stuck, "fil", zones)).toBe(
      "Hindi naipadala: Masyadong malayo ang lugar na ito sa Poblacion para mag-pin dito."
    );
  });

  it("a report keeps its own words", () => {
    const report = { operation: "submitWaterLevelReport" as const, payload: { zoneId: "z1", depthLevel: "knee" } as OutboxEntry["payload"] };
    expect(entryStatusText(entry({ ...report, waitReason: "rate_limited" }), "en", zones)).toBe(
      "Waiting: one report per barangay every 5 minutes. It will send by itself."
    );
    expect(entryStatusText(entry({ ...report, status: "stuck", stuckReason: "too_far" }), "en", zones)).toMatch(
      /^Couldn't send: Your location is more than 15 km from this barangay/
    );
  });
});
