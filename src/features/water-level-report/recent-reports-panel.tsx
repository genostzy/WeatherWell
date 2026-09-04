"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { REPORT_THRESHOLD } from "@/lib/mock-data";
import { useWaterLevelReports, getRecentReportsForZoneLive } from "@/lib/water-level-reports";
import { TimeAgo } from "@/components/time-ago";
import { DEPTH_LABEL, DEPTH_CM, DEPTH_SEVERITY } from "@/lib/depth";
import { SEVERITY_HEX } from "@/lib/severity";
import type { LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "What neighbours are reporting", fil: "Ang iniuulat ng mga kapitbahay" };
const SUBTITLE: LocalizedText = {
  en: "Recent water-level reports from this zone",
  fil: "Kamakailang ulat ng lalim ng tubig mula sa zone na ito",
};
const NO_REPORTS: LocalizedText = {
  en: "No reports from this zone yet — yours would be the first.",
  fil: "Wala pang ulat mula sa zone na ito — ikaw ang mauuna.",
};
const OUTLIER: LocalizedText = { en: "Outlier — downweighted", fil: "Outlier — binabaan ang timbang" };
const AGREEING: LocalizedText = { en: "agreeing reports", fil: "magkatugmang ulat" };
const THRESHOLD_NOTE: LocalizedText = {
  en: "reports needed before an alert can auto-trigger",
  fil: "ulat ang kailangan bago mag-auto-trigger ang alerto",
};

export function RecentReportsPanel({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const allReports = useWaterLevelReports();
  const reports = getRecentReportsForZoneLive(allReports, zone.id);
  const agreeing = reports.filter((report) => !report.isOutlier).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t(SUBTITLE, lang)}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {reports.length === 0 ? (
          <p lang={lang} className="text-sm text-muted-foreground">
            {t(NO_REPORTS, lang)}
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{agreeing}</span>
              <span className="text-sm text-muted-foreground">{t(AGREEING, lang)}</span>
            </div>
            {/* Progress toward the multi-report threshold — PRD Anti-Abuse layer 3. */}
            <div className="flex gap-1" aria-hidden="true">
              {Array.from({ length: Math.max(REPORT_THRESHOLD, agreeing) }).map((_, index) => (
                <div
                  key={index}
                  className={`h-2 flex-1 rounded-sm ${index < agreeing ? "bg-severity-orange" : "bg-muted"}`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {REPORT_THRESHOLD} {t(THRESHOLD_NOTE, lang)}
            </p>

            <ul className="space-y-2 border-t pt-3">
              {reports.map((report) => (
                <li key={report.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: SEVERITY_HEX[DEPTH_SEVERITY[report.depthLevel]] }}
                    />
                    <span className="truncate">
                      {t(DEPTH_LABEL[report.depthLevel], lang)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ~{DEPTH_CM[report.depthLevel]}cm
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {report.isOutlier && (
                      <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                        <TriangleAlert aria-hidden="true" className="h-3 w-3" />
                        {t(OUTLIER, lang)}
                      </Badge>
                    )}
                    <TimeAgo
                      reportedAt={report.reportedAt}
                      className="text-xs text-muted-foreground tabular-nums"
                    />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
