"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Trash2 } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useCommunityPins, deleteCommunityPin } from "@/lib/community-pins";
import { PIN_STATUS_LABEL, PIN_STATUS_COLOR } from "@/lib/community-pin";
import type { LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Community Pin Moderation", fil: "Pagmo-moderate ng Community Pins" };
const SUBTITLE: LocalizedText = {
  en: "Unverified resident reports. Admin can remove any pin early — the same human override the alert pipeline has.",
  fil: "Hindi pa na-verify na ulat ng residente. Maaaring alisin agad ng admin ang kahit anong pin.",
};
const NO_PINS: LocalizedText = { en: "No community pins right now.", fil: "Walang community pin sa ngayon." };
const REMOVE: LocalizedText = { en: "Remove", fil: "Alisin" };
const NET_SCORE: LocalizedText = { en: "net", fil: "net" };
const UNKNOWN_ZONE: LocalizedText = { en: "Unassigned", fil: "Walang zone" };

export function CommunityPinModerationPanel({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const pins = useCommunityPins();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)} ({pins.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t(SUBTITLE, lang)}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {pins.length === 0 && <p className="text-sm text-muted-foreground">{t(NO_PINS, lang)}</p>}

        {pins.map((pin) => {
          const zone = zones.find((z) => z.id === pin.zoneId);
          const netScore = pin.upvotes - pin.downvotes;
          return (
            <div
              key={pin.id}
              className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: PIN_STATUS_COLOR[pin.statusTag] }}
                  />
                  <span className="font-medium">{t(PIN_STATUS_LABEL[pin.statusTag], lang)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {zone ? zone.name : t(UNKNOWN_ZONE, lang)}
                  </span>
                </div>
                {pin.caption && <p className="text-sm break-words">{pin.caption}</p>}
                <p className="text-xs text-muted-foreground tabular-nums">
                  ▲ {pin.upvotes} · ▼ {pin.downvotes} · {netScore >= 0 ? "+" : ""}
                  {netScore} {t(NET_SCORE, lang)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteCommunityPin(pin.id)}
                aria-label={`${t(REMOVE, lang)} — ${t(PIN_STATUS_LABEL[pin.statusTag], lang)}`}
                className="border-severity-red text-severity-red"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                {t(REMOVE, lang)}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
