"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { PIN_STATUS_LABEL, type PinStatusTag } from "@/lib/community-pin";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "My Pins", fil: "Aking mga Pin" };
const EMPTY: LocalizedText = {
  en: "No pins yet. Drop one from the homepage map.",
  fil: "Wala pang pin. Maglagay ng isa mula sa mapa sa homepage.",
};
const REMOVED: LocalizedText = { en: "Removed", fil: "Naalis" };

export interface ResidentPinRow {
  id: string;
  zoneName: string;
  statusTag: string;
  caption: string | null;
  createdAt: string;
  removed: boolean;
}

export function ResidentPinsList({ pins }: { pins: ResidentPinRow[] }) {
  const { lang } = useLanguage();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t(TITLE, lang)}</h1>
      {pins.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(EMPTY, lang)}</p>
      ) : (
        <div className="space-y-2">
          {pins.map((p) => {
            const statusLabel = PIN_STATUS_LABEL[p.statusTag as PinStatusTag] as LocalizedText | undefined;
            return (
              <Card key={p.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {statusLabel ? t(statusLabel, lang) : p.statusTag}
                      {p.removed && (
                        <span className="ml-2 text-xs text-severity-red">({t(REMOVED, lang)})</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.zoneName}</p>
                    {p.caption && <p className="text-xs text-muted-foreground">{p.caption}</p>}
                  </div>
                  <div className="text-right">
                    <time className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString(lang === "fil" ? "fil-PH" : "en-PH")}
                    </time>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
