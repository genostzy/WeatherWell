"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { SEVERITY_HEX } from "@/lib/severity";
import type { LocalizedText, PredictionStep } from "@/lib/types";

const PREDICTION_FOR: LocalizedText = { en: "Prediction for", fil: "Prediksyon para sa" };
const ESTIMATED: LocalizedText = { en: "Estimated", fil: "Tantiya" };
const WILL_BE_VALIDATED: LocalizedText = {
  en: "Will be validated by local data",
  fil: "Aabutin ng oras bago ma-validate",
};

export function PredictionTimeline({
  steps,
  zoneName,
}: {
  steps: PredictionStep[];
  zoneName: string;
}) {
  const { lang } = useLanguage();

  if (steps.length === 0) return null;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>🌊</span>
          <span>{t(PREDICTION_FOR, lang)} {zoneName}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="h-4 w-4 rounded-full border-2"
                  style={{
                    backgroundColor: SEVERITY_HEX[step.severity],
                    borderColor: SEVERITY_HEX[step.severity],
                  }}
                />
                <span className="text-xs font-medium">{t(step.timing, lang)}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t(step.label, lang)}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="mx-1 h-0.5 w-8 bg-muted-foreground/30" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Badge variant="outline" className="text-xs">
            {t(ESTIMATED, lang)} — {t(WILL_BE_VALIDATED, lang)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
