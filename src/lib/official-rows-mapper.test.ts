import { describe, it, expect } from "vitest";
import { toOfficialRows, type ProfileRow, type PlaceRow } from "./official-rows-mapper";

const ZONES: PlaceRow[] = [{ code: "0105528012", name: "Barangay Nilombot, Mapandan" }];
const MUNICIPALITIES: PlaceRow[] = [{ code: "0105528", name: "Mapandan" }];

describe("toOfficialRows", () => {
  it("resolves a 10-digit area_code against the zones list", () => {
    const profiles: ProfileRow[] = [{ id: "u1", display_name: "Juan", area_code: "0105528012" }];
    const emailById = new Map([["u1", "juan@example.com"]]);

    expect(toOfficialRows(profiles, ZONES, MUNICIPALITIES, emailById)).toEqual([
      { email: "juan@example.com", displayName: "Juan", areaName: "Barangay Nilombot, Mapandan" },
    ]);
  });

  it("resolves a 7-digit area_code against the municipalities list", () => {
    const profiles: ProfileRow[] = [{ id: "u2", display_name: "Pedro", area_code: "0105528" }];
    const emailById = new Map([["u2", "pedro@example.com"]]);

    expect(toOfficialRows(profiles, ZONES, MUNICIPALITIES, emailById)).toEqual([
      { email: "pedro@example.com", displayName: "Pedro", areaName: "Mapandan" },
    ]);
  });

  it("falls back to the raw area code when no matching zone or municipality is found", () => {
    const profiles: ProfileRow[] = [{ id: "u3", display_name: "Ana", area_code: "9999999999" }];
    const emailById = new Map([["u3", "ana@example.com"]]);

    expect(toOfficialRows(profiles, ZONES, MUNICIPALITIES, emailById)).toEqual([
      { email: "ana@example.com", displayName: "Ana", areaName: "9999999999" },
    ]);
  });

  it("falls back to '(unknown)' for an email the lookup map has no entry for", () => {
    const profiles: ProfileRow[] = [{ id: "u4", display_name: "Rosa", area_code: "0105528012" }];

    expect(toOfficialRows(profiles, ZONES, MUNICIPALITIES, new Map())).toEqual([
      { email: "(unknown)", displayName: "Rosa", areaName: "Barangay Nilombot, Mapandan" },
    ]);
  });

  it("falls back to an empty display name when display_name is null", () => {
    const profiles: ProfileRow[] = [{ id: "u5", display_name: null, area_code: "0105528012" }];
    const emailById = new Map([["u5", "x@example.com"]]);

    expect(toOfficialRows(profiles, ZONES, MUNICIPALITIES, emailById)).toEqual([
      { email: "x@example.com", displayName: "", areaName: "Barangay Nilombot, Mapandan" },
    ]);
  });
});
