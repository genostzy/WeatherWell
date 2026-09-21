"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { CheckInStatus, LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "My Check-ins", fil: "Aking mga Check-in" };
const EMPTY: LocalizedText = {
  en: "No check-ins yet. You can check in from the evacuation page.",
  fil: "Wala pang check-in. Maaari kang mag-check-in mula sa evacuation page.",
};

/** Compact, per-row form of check-in-panel.tsx's "I'm safe" / "I need help". */
const STATUS_LABEL: Record<CheckInStatus, LocalizedText> = {
  safe: { en: "Safe", fil: "Ligtas" },
  needs_help: { en: "Needs help", fil: "Kailangan ng tulong" },
};

export interface ResidentCheckInRow {
  id: string;
  zoneName: string;
  status: string;
  checkedInAt: string;
}

export function ResidentCheckInsList({ checkIns }: { checkIns: ResidentCheckInRow[] }) {
  const { lang } = useLanguage();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t(TITLE, lang)}</h1>
      {checkIns.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(EMPTY, lang)}</p>
      ) : (
        <div className="space-y-2">
          {checkIns.map((c) => {
            const statusLabel = STATUS_LABEL[c.status as CheckInStatus] as LocalizedText | undefined;
            return (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{statusLabel ? t(statusLabel, lang) : c.status}</p>
                    <p className="text-xs text-muted-foreground">{c.zoneName}</p>
                  </div>
                  <time className="text-xs text-muted-foreground">
                    {new Date(c.checkedInAt).toLocaleDateString(lang === "fil" ? "fil-PH" : "en-PH")}
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
