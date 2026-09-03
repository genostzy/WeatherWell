"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CloudRain,
  MapPin,
  RotateCcw,
  ShieldAlert,
  Building2,
} from "lucide-react";
import { BackLink } from "@/components/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportForm } from "@/features/water-level-report/report-form";
import { RecentReportsPanel } from "@/features/water-level-report/recent-reports-panel";
import { ReportExplainer } from "@/features/water-level-report/report-explainer";
import { ShareAlertButton } from "@/features/alerts/share-alert-button";
import { SeverityBadge } from "@/features/alerts/severity-badge";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { DEPTH_LABEL, DEPTH_CM, DEPTH_SEVERITY, type DepthLevel } from "@/lib/depth";
import { getRainfallForZone, isHeavyRainfall } from "@/lib/mock-data";
import { useZoneOverrides, resolveEffectiveAlert, resolveEffectiveCenterStatus } from "@/lib/zone-overrides";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { CENTER_STATUS_LABEL, CENTER_STATUS_CLASS } from "@/lib/center-status";
import type { LocalizedText } from "@/lib/types";

const PAGE_TITLE: LocalizedText = { en: "Report water level", fil: "Iulat ang lalim ng tubig" };
const PAGE_INTRO: LocalizedText = {
  en: "Tell your barangay how deep the water is where you are. It takes one tap.",
  fil: "Sabihin sa barangay kung gaano kalalim ang tubig kung nasaan ka. Isang pindot lang.",
};
const ZONE_NOW: LocalizedText = { en: "Your zone right now", fil: "Ang iyong zone ngayon" };
const RAINFALL: LocalizedText = { en: "Rainfall", fil: "Ulan" };
const HEAVY_RAIN_NOW: LocalizedText = { en: "Heavy rain right now", fil: "Malakas ang ulan ngayon" };
const CLEAR_NO_ALERT: LocalizedText = { en: "No active alert", fil: "Walang aktibong alerto" };
const EVACUATION_CENTER: LocalizedText = { en: "Evacuation center", fil: "Evacuation center" };
const SAFETY_FIRST: LocalizedText = { en: "Report from somewhere safe", fil: "Mag-ulat mula sa ligtas na lugar" };
const SAFETY_BODY: LocalizedText = {
  en: "Never wade into moving water to measure it. Judge the depth against something you can see from where you are — a step, a fence, a parked tricycle.",
  fil: "Huwag lumusong sa umaagos na tubig para sukatin ito. Tantiyahin ang lalim gamit ang nakikita mo mula sa kinaroroonan mo.",
};
const THANKS: LocalizedText = { en: "Report recorded", fil: "Naitala ang ulat" };
const THANKS_BODY: LocalizedText = {
  en: "Thanks — your report is in. In Phase 1 it stays on this device; from Phase 3 it joins the threshold that can trigger a real alert.",
  fil: "Salamat — naitala ang ulat mo. Sa Phase 1 dito lang ito sa device; mula Phase 3 ito na ang bahagi ng threshold para sa totoong alerto.",
};
const YOU_REPORTED: LocalizedText = { en: "You reported", fil: "Iniulat mo" };
const MAPS_TO: LocalizedText = { en: "maps to", fil: "katumbas ng" };
const WHAT_NOW: LocalizedText = { en: "What now", fil: "Ano ngayon" };
const SEE_EVACUATION: LocalizedText = { en: "See evacuation steps", fil: "Tingnan ang hakbang sa paglikas" };
const VIEW_ZONES: LocalizedText = { en: "Check nearby zones", fil: "Tingnan ang kalapit na zone" };
const REPORT_AGAIN: LocalizedText = { en: "Report again", fil: "Mag-ulat muli" };

export default function ReportPage() {
  const [submitted, setSubmitted] = useState<DepthLevel | null>(null);
  const zone = useSelectedZone();
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();

  const alert = resolveEffectiveAlert(zone.id, overrides[zone.id]?.alertSeverity);
  const status = getZoneStatus(alert);
  const statusColor = getZoneStatusColor(alert);
  const rainfall = getRainfallForZone(zone.id);
  const centerStatus = resolveEffectiveCenterStatus(zone.centerStatus, overrides[zone.id]?.centerStatus);

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md space-y-6 lg:max-w-5xl">
        <BackLink />

        <div>
          <h1 className="text-lg font-semibold md:text-xl">
            {t(PAGE_TITLE, lang)} — {zone.name}
          </h1>
          <p lang={lang} className="text-sm text-muted-foreground">
            {t(PAGE_INTRO, lang)}
          </p>
        </div>

        {/* Context first: what the zone already knows, so the resident is
            reporting against a picture rather than into a void. */}
        <Card className="gap-0 overflow-hidden py-0">
          <div className="h-2 w-full" style={{ backgroundColor: statusColor }} />
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t(ZONE_NOW, lang)}</p>
                <p className="flex items-center gap-1.5 font-medium">
                  <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {zone.name}
                </p>
                <p className="text-lg font-bold" style={{ color: statusColor }}>
                  {t(ZONE_STATUS_LABEL[status], lang)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {alert ? <SeverityBadge severity={alert.severity} /> : (
                  <span className="text-sm text-green-500">{t(CLEAR_NO_ALERT, lang)}</span>
                )}
                {alert && <ShareAlertButton alert={alert} zone={zone} />}
              </div>
            </div>

            {alert && (
              <p lang={lang} className="text-sm">
                {t(alert.message, lang)}
              </p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-sm">
              <span className="flex items-center gap-1.5">
                <CloudRain
                  aria-hidden="true"
                  className={`h-4 w-4 ${isHeavyRainfall(rainfall) ? "text-severity-orange" : "text-muted-foreground"}`}
                />
                {t(RAINFALL, lang)}: {rainfall} mm/hr
                {isHeavyRainfall(rainfall) && (
                  <span className="text-severity-orange">· {t(HEAVY_RAIN_NOW, lang)}</span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                {t(EVACUATION_CENTER, lang)}: {zone.evacuationCenterName}
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CENTER_STATUS_CLASS[centerStatus]}`}>
                  {t(CENTER_STATUS_LABEL[centerStatus], lang)}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* min-w-0 on both columns: a grid item defaults to min-width:auto, so
            the depth-reference figure's intrinsic width would otherwise push
            the column wider than a 375px phone screen. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0 space-y-6">
            {submitted ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-green-500">
                    <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                    {t(THANKS, lang)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p role="status" lang={lang} className="text-sm">
                    {t(THANKS_BODY, lang)}
                  </p>

                  <div className="rounded-md border-2 border-border p-3">
                    <p className="text-xs text-muted-foreground">{t(YOU_REPORTED, lang)}</p>
                    <p className="text-lg font-semibold">
                      {t(DEPTH_LABEL[submitted], lang)}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        ~{DEPTH_CM[submitted]}cm
                      </span>
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{t(MAPS_TO, lang)}</span>
                      <SeverityBadge severity={DEPTH_SEVERITY[submitted]} />
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t(WHAT_NOW, lang)}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link href="/evacuation">
                          {t(SEE_EVACUATION, lang)}
                          <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/map">{t(VIEW_ZONES, lang)}</Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSubmitted(null)}>
                        <RotateCcw aria-hidden="true" className="h-4 w-4" />
                        {t(REPORT_AGAIN, lang)}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <ReportForm zoneId={zone.id} onSubmit={setSubmitted} />

                <Card className="border-severity-yellow/40">
                  <CardContent className="flex gap-3">
                    <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-severity-yellow" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{t(SAFETY_FIRST, lang)}</p>
                      <p lang={lang} className="text-xs text-muted-foreground">
                        {t(SAFETY_BODY, lang)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <div className="min-w-0 space-y-6">
            <RecentReportsPanel zone={zone} />
            <ReportExplainer />
          </div>
        </div>
      </div>
    </main>
  );
}
