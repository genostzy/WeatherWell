import { describe, it, expect } from "vitest";
import { buildSeedSql, buildTeardownSql, quote, municipalitiesFrom } from "./generate-seed";
import { MOCK_ZONES } from "@/lib/mock-data";

/** The fixed, obviously-fake account the seed attributes its demo pins to. */
const SEED_ACCOUNT_ID = "00000000-0000-4000-8000-00000000dead";

describe("buildSeedSql", () => {
  it("emits one zone row per mock zone", () => {
    const sql = buildSeedSql();
    for (const zone of MOCK_ZONES) {
      expect(sql).toContain(`'${zone.id}'`);
    }
  });

  it("is idempotent, so re-seeding a pilot database is not destructive", () => {
    expect(buildSeedSql()).toContain("on conflict (id) do update");
  });

  it("escapes apostrophes, which Filipino route text contains", () => {
    // A single unescaped quote turns the seed into a SQL syntax error at best
    // and an injection at worst. quote() must double it to form a valid
    // Postgres string literal, e.g. Barangay Nilombot's -> Barangay Nilombot''s.
    expect(quote("Barangay Nilombot's evacuation route")).toBe(
      "'Barangay Nilombot''s evacuation route'"
    );
  });

  it("emits a -- weatherwell-seed comment marking the generated SQL as seed output", () => {
    expect(buildSeedSql()).toContain("-- weatherwell-seed");
  });

  it("attributes every seeded pin to the seed account, which it also creates", () => {
    // community_pins.author_id is a real foreign key to auth.users now, so a
    // pin row without its account is a seed that fails halfway and leaves the
    // community layer empty.
    const sql = buildSeedSql();
    const pinRows = sql
      .split("\n")
      .filter((line) => line.includes("into public.community_pins"));

    expect(pinRows.length).toBeGreaterThan(0);
    expect(sql).toContain("insert into auth.users");
    for (const row of pinRows) {
      expect(row).toContain(SEED_ACCOUNT_ID);
    }
  });

  it("seeds no votes, so no pin claims corroboration nobody gave", () => {
    // Tallies are derived from pin_votes. Seeding votes would mean inventing
    // voters, and the number of neighbours who corroborated a pin is exactly
    // the signal residents are asked to trust.
    expect(buildSeedSql()).not.toContain("pin_votes");
  });

  it("emits an idempotent municipalities insert for every distinct town in MOCK_ZONES", () => {
    // Task 1 (officials-and-roles): the appointment command resolves a town
    // by name, so every town a mock zone belongs to needs a row here.
    const sql = buildSeedSql();
    expect(sql).toContain("insert into public.municipalities");
    expect(sql).toContain("on conflict (code) do nothing");
  });
});

describe("municipalitiesFrom", () => {
  it("emits one row per distinct town, with the 7-digit town code and the name after the last ', '", () => {
    // Four mock zones in four different towns -> four rows, one per town,
    // each code the first seven digits of that barangay's PSGC code.
    const zones = [
      { psgcBarangayCode: "0105528012", name: "Barangay Nilombot, Mapandan" },
      { psgcBarangayCode: "0105526025", name: "Barangay Poblacion, Mangaldan" },
      { psgcBarangayCode: "0105525039", name: "Barangay Poblacion, Manaoag" },
      { psgcBarangayCode: "0105538021", name: "Barangay Poblacion Norte, Santa Barbara" },
    ];

    const result = municipalitiesFrom(zones);

    expect(result).toEqual([
      { code: "0105525", name: "Manaoag" },
      { code: "0105526", name: "Mangaldan" },
      { code: "0105528", name: "Mapandan" },
      { code: "0105538", name: "Santa Barbara" },
    ]);
  });

  it("collapses two barangays in the same town into one municipality row", () => {
    const zones = [
      { psgcBarangayCode: "0105528012", name: "Barangay Nilombot, Mapandan" },
      { psgcBarangayCode: "0105528013", name: "Barangay Dos, Mapandan" },
    ];

    expect(municipalitiesFrom(zones)).toEqual([{ code: "0105528", name: "Mapandan" }]);
  });

  it("MOCK_ZONES itself produces four rows, one per town", () => {
    // The four real mock zones live in four different towns today; this
    // pins that shape so a future zone addition is a deliberate choice.
    expect(municipalitiesFrom(MOCK_ZONES)).toHaveLength(4);
  });
});

describe("buildTeardownSql", () => {
  it("deletes every id the seed created, and the account behind them", () => {
    // A seed row left in a pilot database is a fake flood report shown to real
    // residents. The teardown is the only thing standing between those.
    const teardown = buildTeardownSql();
    const seededPinIds = [...buildSeedSql().matchAll(/'(00000000-0000-4000-8000-0000dead[0-9a-f]{4})'/g)].map(
      (match) => match[1]
    );

    expect(new Set(seededPinIds).size).toBeGreaterThan(0);
    for (const id of new Set(seededPinIds)) {
      expect(teardown).toContain(id);
    }
    expect(teardown).toContain(`delete from auth.users where id = '${SEED_ACCOUNT_ID}'`);
    expect(teardown).toContain("delete from public.profiles");
  });
});

