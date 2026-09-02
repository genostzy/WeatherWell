import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import axe from "axe-core";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AlertCard } from "@/features/alerts/alert-card";
import { CascadeWarning } from "@/features/alerts/cascade-warning";
import { PredictionTimeline } from "@/features/alerts/prediction-timeline";
import { ShareAlertButton } from "@/features/alerts/share-alert-button";
import { EvacuationInstructions } from "@/features/evacuation/evacuation-instructions";
import { EmergencyCard } from "@/features/evacuation/emergency-card";
import { ReportForm } from "@/features/water-level-report/report-form";
import { ZoneMap } from "@/features/zones/zone-map";
import { ConsentNotice } from "@/features/onboarding/consent-notice";
import { ZonePicker } from "@/features/onboarding/zone-picker";
import { EmergencyHotlineButton } from "@/components/emergency-hotline-button";
import AdminPage from "@/app/admin/page";
import {
  MOCK_ZONES,
  MOCK_ALERTS,
  MOCK_CASCADES,
  getPredictionsForZone,
} from "@/lib/mock-data";

async function violationsFor(ui: ReactElement): Promise<string[]> {
  // ReportForm and EmergencyHotlineButton now render a shadcn Tooltip
  // (Radix), which requires an ancestor TooltipProvider — the real app
  // supplies this via layout.tsx. TooltipProvider renders no DOM of its
  // own, so wrapping every case here is harmless for the other components.
  const { container } = render(<TooltipProvider>{ui}</TooltipProvider>);
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

  it("cascade warning has no violations", async () => {
    const cascade = MOCK_CASCADES[0];
    const fromZone = MOCK_ZONES.find((z) => z.id === cascade.fromZoneId)!;
    const toZone = MOCK_ZONES.find((z) => z.id === cascade.toZoneId)!;
    expect(
      await violationsFor(
        <CascadeWarning cascade={cascade} fromZone={fromZone} toZone={toZone} />
      )
    ).toEqual([]);
  });

  it("prediction timeline has no violations", async () => {
    expect(
      await violationsFor(
        <PredictionTimeline
          steps={getPredictionsForZone("zone-1")}
          zoneName={MOCK_ZONES[0].name}
        />
      )
    ).toEqual([]);
  });

  it("share alert button has no violations", async () => {
    expect(
      await violationsFor(<ShareAlertButton alert={MOCK_ALERTS[0]} zone={MOCK_ZONES[0]} />)
    ).toEqual([]);
  });

  it("emergency card has no violations", async () => {
    expect(await violationsFor(<EmergencyCard zone={MOCK_ZONES[0]} />)).toEqual([]);
  });

  it("admin simulation page has no violations", async () => {
    expect(await violationsFor(<AdminPage />)).toEqual([]);
  });
});
