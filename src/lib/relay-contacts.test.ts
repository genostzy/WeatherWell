import { describe, it, expect, beforeEach } from "vitest";
import { buildRelaySmsHref, loadRelayContacts, saveRelayContacts, MAX_RELAY_CONTACTS } from "./relay-contacts";

describe("relay contacts", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips contacts through this device's storage only", () => {
    saveRelayContacts([{ name: "Lola Nena", number: "0917 123 0000" }]);
    expect(loadRelayContacts()).toEqual([{ name: "Lola Nena", number: "0917 123 0000" }]);
  });

  it("keeps at most five and drops entries with no number", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `N${i}`, number: `0917000000${i}` }));
    saveRelayContacts([{ name: "blank", number: "  " }, ...many]);
    const saved = loadRelayContacts();
    expect(saved).toHaveLength(MAX_RELAY_CONTACTS);
    expect(saved[0].name).toBe("N0");
  });

  it("reads garbage in storage as no contacts", () => {
    localStorage.setItem("weatherwell.relayContacts", "{not json");
    expect(loadRelayContacts()).toEqual([]);
  });

  it("builds an Android group SMS link with every number and the message", () => {
    const href = buildRelaySmsHref(["0917 123 0000", "+63 918 000 1111"], "Baha na!", "Mozilla/5.0 (Linux; Android 14)");
    expect(href).toBe(`sms:09171230000,+639180001111?body=${encodeURIComponent("Baha na!")}`);
  });

  it("uses the iOS group form on an iPhone", () => {
    const href = buildRelaySmsHref(["0917 123 0000", "0918 000 1111"], "Baha na!", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    expect(href).toBe(`sms:/open?addresses=09171230000,09180001111&body=${encodeURIComponent("Baha na!")}`);
  });
});
