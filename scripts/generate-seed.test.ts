import { describe, it, expect } from "vitest";
import { buildSeedSql, quote } from "./generate-seed";
import { MOCK_ZONES } from "@/lib/mock-data";

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

  it("marks every seeded row so a pilot can delete demo data", () => {
    expect(buildSeedSql()).toContain("-- weatherwell-seed");
  });
});
