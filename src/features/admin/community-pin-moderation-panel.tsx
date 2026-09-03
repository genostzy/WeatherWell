"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Trash2, RotateCcw } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useAllCommunityPins, removePinByAdmin, restoreCommunityPin, type PinRemovalReason } from "@/lib/community-pins";
import { PIN_STATUS_LABEL, PIN_STATUS_COLOR } from "@/lib/community-pin";
import type { LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Community Pin Moderation", fil: "Pagmo-moderate ng Community Pins" };
const SUBTITLE: LocalizedText = {
  en: "Unverified resident reports. Admin can remove any pin early, or restore one voting removed wrongly — the same human override the alert pipeline has.",
  fil: "Hindi pa na-verify na ulat ng residente. Maaaring alisin o ibalik ng admin ang kahit anong pin.",
};
const ZONE_TITLE_SUFFIX: LocalizedText = { en: "in", fil: "sa" };
const NO_PINS: LocalizedText = { en: "No community pins right now.", fil: "Walang community pin sa ngayon." };
const REMOVE: LocalizedText = { en: "Remove", fil: "Alisin" };
const RESTORE: LocalizedText = { en: "Restore", fil: "Ibalik" };
const NET_SCORE: LocalizedText = { en: "net", fil: "net" };
const UNKNOWN_ZONE: LocalizedText = { en: "Unassigned", fil: "Walang zone" };
const REMOVED_SECTION: LocalizedText = { en: "Removed (restorable)", fil: "Inalis (maaaring ibalik)" };
const REMOVED_BY_VOTES: LocalizedText = { en: "Removed by votes", fil: "Inalis ng boto" };
const REMOVED_BY_ADMIN: LocalizedText = { en: "Removed by admin", fil: "Inalis ng admin" };

const REMOVAL_REASON_LABEL: Record<PinRemovalReason, LocalizedText> = {
  net_score: REMOVED_BY_VOTES,
  admin: REMOVED_BY_ADMIN,
};

/**
 * Shared by the global admin dashboard and the per-zone dashboard — pass
 * `zoneId` to scope both the list and the title to one barangay, so a zone
 * official moderating their own zone doesn't need the global view.
 */
export function CommunityPinModerationPanel({ zones, zoneId }: { zones: Zone[]; zoneId?: string }) {
  const { lang } = useLanguage();
  const allPins = useAllCommunityPins().filter((pin) => !zoneId || pin.zoneId === zoneId);
  const activePins = allPins.filter((pin) => !pin.removed);
  const removedPins = allPins.filter((pin) => pin.removed);
  const scopedZoneName = zoneId ? zones.find((z) => z.id === zoneId)?.name : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
          {scopedZoneName && ` ${t(ZONE_TITLE_SUFFIX, lang)} ${scopedZoneName}`} ({activePins.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t(SUBTITLE, lang)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {activePins.length === 0 && <p className="text-sm text-muted-foreground">{t(NO_PINS, lang)}</p>}

        {activePins.map((pin) => {
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
                  {!scopedZoneName && (
                    <span className="truncate text-xs text-muted-foreground">
                      {zone ? zone.name : t(UNKNOWN_ZONE, lang)}
                    </span>
                  )}
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
                onClick={() => removePinByAdmin(pin.id)}
                aria-label={`${t(REMOVE, lang)} — ${t(PIN_STATUS_LABEL[pin.statusTag], lang)}`}
                className="border-severity-red text-severity-red"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                {t(REMOVE, lang)}
              </Button>
            </div>
          );
        })}

        {removedPins.length > 0 && (
          <div className="space-y-3 border-t pt-3">
            <p className="text-sm font-medium text-muted-foreground">{t(REMOVED_SECTION, lang)}</p>
            {removedPins.map((pin) => {
              const zone = zones.find((z) => z.id === pin.zoneId);
              return (
                <div
                  key={pin.id}
                  className="flex flex-wrap items-start justify-between gap-3 opacity-70"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium line-through">{t(PIN_STATUS_LABEL[pin.statusTag], lang)}</span>
                      {!scopedZoneName && (
                        <span className="truncate text-xs text-muted-foreground">
                          {zone ? zone.name : t(UNKNOWN_ZONE, lang)}
                        </span>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {t(REMOVAL_REASON_LABEL[pin.removedReason ?? "admin"], lang)}
                      </Badge>
                    </div>
                    {pin.caption && <p className="text-sm break-words">{pin.caption}</p>}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restoreCommunityPin(pin.id)}
                    aria-label={`${t(RESTORE, lang)} — ${t(PIN_STATUS_LABEL[pin.statusTag], lang)}`}
                  >
                    <RotateCcw aria-hidden="true" className="h-4 w-4" />
                    {t(RESTORE, lang)}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
