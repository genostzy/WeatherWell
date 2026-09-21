"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { DEPTH_LABEL, type DepthLevel } from "@/lib/depth";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "My Reports", fil: "Aking mga Ulat" };
const EMPTY: LocalizedText = {
  en: "No reports yet. Submit one from the homepage map.",
  fil: "Wala pang ulat. Magsumite mula sa mapa sa homepage.",
};

export interface ResidentReportRow {
  id: string;
  zoneName: string;
  /** A plain string, not DepthLevel: the column is `text` with a CHECK
   * constraint, not a Postgres enum, so nothing at the type level rules out
   * an unrecognized value reaching here. Looked up defensively below. */
  depthLevel: string;
  reportedAt: string;
}

export function ResidentReportsList({ reports }: { reports: ResidentReportRow[] }) {
  const { lang } = useLanguage();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t(TITLE, lang)}</h1>
      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(EMPTY, lang)}</p>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const depthLabel = DEPTH_LABEL[r.depthLevel as DepthLevel] as LocalizedText | undefined;
            return (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{depthLabel ? t(depthLabel, lang) : r.depthLevel}</p>
                    <p className="text-xs text-muted-foreground">{r.zoneName}</p>
                  </div>
                  <time className="text-xs text-muted-foreground">
                    {new Date(r.reportedAt).toLocaleDateString(lang === "fil" ? "fil-PH" : "en-PH")}
                  </time>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
