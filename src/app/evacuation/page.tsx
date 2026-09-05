"use client";

import { BackLink } from "@/components/back-link";
import { EvacuationInstructions } from "@/features/evacuation/evacuation-instructions";
import { EmergencyCard } from "@/features/evacuation/emergency-card";
import { CheckInPanel } from "@/features/evacuation/check-in-panel";
import { AlertDowngradeNotice } from "@/features/alerts/alert-downgrade-notice";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useZoneOverrides, resolveEffectiveAlert, resolveAlertDowngrade } from "@/lib/zone-overrides";
import { getZoneStatus } from "@/lib/zone-status";
import type { LocalizedText } from "@/lib/types";

const HEADING: LocalizedText = { en: "Evacuation", fil: "Paglikas" };

export default function EvacuationPage() {
  const { lang } = useLanguage();
  const zone = useSelectedZone();
  const overrides = useZoneOverrides();
  const alert = resolveEffectiveAlert(zone.id, overrides[zone.id]?.alertSeverity);
  const downgrade = resolveAlertDowngrade(zone.id, overrides[zone.id]?.alertSeverity);
  const status = getZoneStatus(alert);
  const showCheckIn = status === "dangerous" || status === "hazardous";

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <BackLink className="max-w-md lg:max-w-3xl" />
      <h1 lang={lang} className="text-lg font-semibold md:text-xl">
        {t(HEADING, lang)} — {zone.name}
      </h1>

      {/*
        The check-in panel below disappears when a zone stops being dangerous.
        On the page a resident opens *because* they were told to leave, that
        needs saying (PRD Anti-Abuse layer 9).
      */}
      {downgrade && (
        <div className="w-full max-w-md lg:max-w-3xl">
          <AlertDowngradeNotice notice={downgrade} />
        </div>
      )}

      <div className="grid w-full max-w-md gap-6 lg:max-w-3xl lg:grid-cols-2 lg:items-start">
        <EvacuationInstructions zone={zone} />
        <div className="space-y-6">
          <EmergencyCard zone={zone} />
          {showCheckIn && <CheckInPanel zoneId={zone.id} />}
        </div>
      </div>
    </main>
  );
}
