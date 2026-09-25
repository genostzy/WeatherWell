import { describe, it, expect } from "vitest";
import { countReportsToday } from "./reports-today";

const report = (zoneId: string, reportedAt: string) => ({
  id: reportedAt + zoneId,
  zoneId,
  depthLevel: "ankle" as const,
  reportedAt,
  trustWeight: 1,
  isOutlier: false,
  reporterEstablished: false,
});

describe("countReportsToday", () => {
  const now = new Date(2026, 8, 23, 15, 0);

  it("counts only reports since local midnight, in the given zones", () => {
    const reports = [
      report("a", new Date(2026, 8, 23, 0, 5).toISOString()),
      report("a", new Date(2026, 8, 23, 14, 0).toISOString()),
      report("a", new Date(2026, 8, 22, 23, 55).toISOString()),
      report("b", new Date(2026, 8, 23, 9, 0).toISOString()),
    ];
    expect(countReportsToday(reports, new Set(["a"]), now)).toBe(2);
    expect(countReportsToday(reports, new Set(["a", "b"]), now)).toBe(3);
  });
});
