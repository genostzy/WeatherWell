import { describe, it, expect } from "vitest";
import { advisoryRecipients, messageNotification, messageRecipients } from "./official-recipients";

const OFFICIALS = [
  { id: "town", areaCode: "0105528" }, // Mapandan
  { id: "nilombot", areaCode: "0105528012" },
  { id: "poblacion", areaCode: "0105528011" },
  { id: "other-town", areaCode: "0105526" }, // Mangaldan
  { id: "other-brgy", areaCode: "0105526025" },
];

describe("who hears about what (officials notified on their phones)", () => {
  it("sends a barangay's update to its town's official only", () => {
    expect(messageRecipients({ direction: "up", townCode: "0105528" }, OFFICIALS)).toEqual(["town"]);
  });

  it("sends the town's update to every barangay official in that town only", () => {
    expect(messageRecipients({ direction: "down", townCode: "0105528" }, OFFICIALS)).toEqual(["nilombot", "poblacion"]);
  });

  it("sends an automatic advisory to the barangay's own official and its town's", () => {
    expect(advisoryRecipients("0105528012", OFFICIALS)).toEqual(["town", "nilombot"]);
  });

  it("sends an upstream heads-up to the downstream barangay's officials and its town's, no other barangay's", () => {
    expect(
      messageRecipients({ direction: "heads_up", townCode: "0105528", barangayCode: "0105528012" }, OFFICIALS)
    ).toEqual(["town", "nilombot"]);
  });

  it("names the upstream barangay in a heads-up", () => {
    const note = messageNotification(
      { direction: "heads_up", kind: "upstream_alert", body: "Barangay Poblacion is under Warning.", senderName: "WeatherWell" },
      "Barangay Nilombot, Mapandan"
    );
    expect(note.title).toBe("Upstream alert for Barangay Nilombot, Mapandan");
    expect(note.body).toBe("Barangay Poblacion is under Warning. Water may reach you. Check your barangay. — WeatherWell");
  });

  it("says plainly what came in", () => {
    const need = messageNotification({ direction: "up", kind: "need_help", body: "Boat needed", senderName: "Kap" }, "Barangay Nilombot, Mapandan");
    expect(need.title).toBe("Barangay Nilombot, Mapandan: We need help");
    expect(need.body).toBe("Boat needed — Kap");
    const down = messageNotification({ direction: "down", kind: "update", body: "Evacuate low areas", senderName: "MDRRMO" }, null);
    expect(down.title).toBe("Update from the town");
    expect(down.body).toBe("Evacuate low areas — MDRRMO");
  });
});
