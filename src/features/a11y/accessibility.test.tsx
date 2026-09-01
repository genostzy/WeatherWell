import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import axe from "axe-core";
import { AlertCard } from "@/features/alerts/alert-card";
import { EvacuationInstructions } from "@/features/evacuation/evacuation-instructions";
import { ReportForm } from "@/features/water-level-report/report-form";
import { ZoneMap } from "@/features/zones/zone-map";
import { ConsentNotice } from "@/features/onboarding/consent-notice";
import { ZonePicker } from "@/features/onboarding/zone-picker";
import { EmergencyHotlineButton } from "@/components/emergency-hotline-button";
import { MOCK_ZONES, MOCK_ALERTS } from "@/lib/mock-data";

async function violationsFor(ui: ReactElement): Promise<string[]> {
  const { container } = render(ui);
  const results = await axe.run(container, {
    rules: {
      // jsdom has no layout/paint, so axe cannot compute contrast here.
      // The severity palette is verified numerically in src/lib/contrast.test.ts.
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });
  return results.violations.map((v) => `${v.id}: ${v.help}`);
}

describe("accessibility (WCAG 2.1 AA, automated subset)", () => {
  it("alert card has no violations", async () => {
    expect(
      await violationsFor(<AlertCard alert={MOCK_ALERTS[0]} zone={MOCK_ZONES[0]} />)
    ).toEqual([]);
  });

  it("evacuation instructions have no violations", async () => {
    expect(
      await violationsFor(<EvacuationInstructions zone={MOCK_ZONES[0]} />)
    ).toEqual([]);
  });

  it("report form has no violations", async () => {
    expect(
      await violationsFor(<ReportForm zoneId="zone-1" onSubmit={() => {}} />)
    ).toEqual([]);
  });

  it("zone map has no violations", async () => {
    expect(await violationsFor(<ZoneMap zones={MOCK_ZONES} />)).toEqual([]);
  });

  it("consent notice has no violations", async () => {
    expect(await violationsFor(<ConsentNotice onAccept={() => {}} />)).toEqual([]);
  });

  it("zone picker has no violations", async () => {
    expect(
      await violationsFor(<ZonePicker zones={MOCK_ZONES} onSelect={() => {}} />)
    ).toEqual([]);
  });

  it("emergency hotline button has no violations", async () => {
    expect(
      await violationsFor(<EmergencyHotlineButton hotlineNumber="09171234567" />)
    ).toEqual([]);
  });
});
