import { describe, it, expect, beforeEach } from "vitest";
import { claimUnattributed, enqueue, readOutbox } from "@/lib/outbox/outbox";
import { idbGetAll, OUTBOX_DB } from "@/lib/outbox/idb";
import { markConsented, markOnboarded, setSelectedZoneId, ONBOARDED_KEY } from "@/features/onboarding/onboarding-storage";
import { forgetThisPhone } from "./forget-this-phone";

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  localStorage.clear();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(OUTBOX_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
});

describe("forgetThisPhone", () => {
  it("empties the queue and its mirror, and forgets setup, consent and the barangay", async () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    markConsented();
    markOnboarded();
    setSelectedZoneId("zone-1");
    await settle();
    expect(await idbGetAll()).toHaveLength(1);

    await forgetThisPhone("me");

    expect(readOutbox()).toEqual([]);
    expect(await idbGetAll()).toEqual([]);
    expect(localStorage.getItem(ONBOARDED_KEY)).toBeNull();
    expect(localStorage.getItem("weatherwell.consent")).toBeNull();
    expect(localStorage.getItem("weatherwell.selectedZoneId")).toBeNull();
  });

  it("keeps what another person on this phone queued", async () => {
    const theirs = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "waist" });
    claimUnattributed("someone-else");
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    claimUnattributed("me");
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "ankle" });
    await settle();

    await forgetThisPhone("me");

    expect(readOutbox().map((entry) => entry.id)).toEqual([theirs.id]);
    expect((await idbGetAll()).map((entry) => entry.id)).toEqual([theirs.id]);
  });
});
