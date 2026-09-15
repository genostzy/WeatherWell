"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Trash2, RotateCcw } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import {
  useAllCommunityPins,
  removePinByAdmin,
  restoreCommunityPin,
  type CommunityPin,
} from "@/lib/community-pins";
import { useOutbox } from "@/lib/outbox/outbox";
import { PIN_STATUS_LABEL, PIN_STATUS_COLOR, type PinRemovalReason } from "@/lib/community-pin";
import { useManagesZone } from "@/lib/auth/official-context";
import type { LanguageCode, LocalizedText, Zone } from "@/lib/types";

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
const REMOVED_SECTION: LocalizedText = { en: "Removed (restorable)", fil: "Inalis (maaaring ibalik)" };
const REMOVED_BY_VOTES: LocalizedText = { en: "Removed by votes", fil: "Inalis ng boto" };
const REMOVED_BY_ADMIN: LocalizedText = { en: "Removed by admin", fil: "Inalis ng admin" };
const REMOVED_BY_AUTHOR: LocalizedText = { en: "Withdrawn by author", fil: "Inalis ng may-akda" };
const VIEW_ONLY: LocalizedText = { en: "View only", fil: "Tingnan lang" };
const SAVE_FAILED: LocalizedText = { en: "Could not save — try again.", fil: "Hindi na-save — subukan ulit." };

const REMOVAL_REASON_LABEL: Record<PinRemovalReason, LocalizedText> = {
  net_score: REMOVED_BY_VOTES,
  admin: REMOVED_BY_ADMIN,
};

/**
 * No reason is a reason: deleteOwnPin removes a pin without stamping the
 * column, because neither allowed code describes an author withdrawing their
 * own content and the moderation trigger refuses a resident writing one
 * anyway. Defaulting the blank case to "Removed by admin" would tell an
 * operator their own team took a pin down when nobody did.
 */
function removalLabel(reason: PinRemovalReason | undefined): LocalizedText {
  return reason ? REMOVAL_REASON_LABEL[reason] : REMOVED_BY_AUTHOR;
}

/**
 * Shared by the global admin dashboard and the per-zone dashboard — pass
 * `zoneId` to scope both the list and the title to one barangay, so a zone
 * official moderating their own zone doesn't need the global view.
 */
export function CommunityPinModerationPanel({ zones, zoneId }: { zones: Zone[]; zoneId?: string }) {
  const { lang } = useLanguage();
  const managesZone = useManagesZone();
  // A single zoneId (the per-zone dashboard) scopes the LIST to that one
  // zone regardless of area — the zone page can be reached for a zone
  // outside the official's area (it shows its own "View only" note and
  // hides its alert/capacity controls), so the actions below are gated
  // per-pin via managesZone rather than assuming the list itself is safe.
  // Otherwise (the global dashboard) only pins in a zone the official
  // manages are listed at all; the database enforces the real limit either
  // way. A pin whose zone cannot be resolved is hidden in both views — same
  // as the Operations map (see admin-map-canvas.tsx) — since it cannot be
  // proven to be in area. Each listed pin carries its resolved zone, so a
  // row never has to render a pin with no zone.
  const allPins = useAllCommunityPins().flatMap((pin) => {
    const zone = zones.find((z) => z.id === pin.zoneId);
    if (!zone) return [];
    if (zoneId ? zone.id !== zoneId : !managesZone(zone)) return [];
    return [{ pin, zone }];
  });
  const activePins = allPins.filter(({ pin }) => !pin.removed);
  const removedPins = allPins.filter(({ pin }) => pin.removed);
  const scopedZoneName = zoneId ? zones.find((z) => z.id === zoneId)?.name : undefined;

  // Tracked here, not inside each row: a pin optimistically flips between
  // the active and removed sections below — different DOM subtrees, so a
  // per-row useState would be unmounted and lose track of its own write the
  // moment that happens. Keyed by pin id so each pin's last attempted write
  // is tracked independently.
  const [pendingByPin, setPendingByPin] = useState<Record<string, string>>({});
  const outbox = useOutbox();

  function trackWrite(pinId: string, entryId: string) {
    setPendingByPin((prev) => ({ ...prev, [pinId]: entryId }));
  }

  // Reactive: once the outbox marks a write permanently failed (an
  // out-of-area write RLS refuses), `mergePins` drops it from the
  // optimistic view and the pin quietly reverts — this is what makes that
  // reversal legible instead of a silent undo.
  function failedFor(pinId: string): boolean {
    const entryId = pendingByPin[pinId];
    return entryId !== undefined && outbox.some((entry) => entry.id === entryId && entry.permanentlyFailed);
  }

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

        {activePins.map(({ pin, zone }) => (
          <ActivePinRow
            key={pin.id}
            pin={pin}
            zone={zone}
            scopedZoneName={scopedZoneName}
            canModerate={managesZone(zone)}
            failed={failedFor(pin.id)}
            onRemove={() => trackWrite(pin.id, removePinByAdmin(pin.id).id)}
            lang={lang}
          />
        ))}

        {removedPins.length > 0 && (
          <div className="space-y-3 border-t pt-3">
            <p className="text-sm font-medium text-muted-foreground">{t(REMOVED_SECTION, lang)}</p>
            {removedPins.map(({ pin, zone }) => (
              <RemovedPinRow
                key={pin.id}
                pin={pin}
                zone={zone}
                scopedZoneName={scopedZoneName}
                canModerate={managesZone(zone)}
                failed={failedFor(pin.id)}
                onRestore={() => trackWrite(pin.id, restoreCommunityPin(pin.id).id)}
                lang={lang}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One active pin's row. Presentational only — its pending-write/error state
 * lives in the parent (see `pendingByPin`), because a pin optimistically
 * moves to a RemovedPinRow in a different DOM subtree the moment this same
 * write lands, which would unmount a row-local useState before the write
 * could ever resolve to a failure.
 */
function ActivePinRow({
  pin,
  zone,
  scopedZoneName,
  canModerate,
  failed,
  onRemove,
  lang,
}: {
  pin: CommunityPin;
  zone: Zone;
  scopedZoneName: string | undefined;
  canModerate: boolean;
  failed: boolean;
  onRemove: () => void;
  lang: LanguageCode;
}) {
  const netScore = pin.upvotes - pin.downvotes;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0">
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
              {zone.name}
            </span>
          )}
        </div>
        {pin.caption && <p className="text-sm break-words">{pin.caption}</p>}
        <p className="text-xs text-muted-foreground tabular-nums">
          ▲ {pin.upvotes} · ▼ {pin.downvotes} · {netScore >= 0 ? "+" : ""}
          {netScore} {t(NET_SCORE, lang)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {canModerate ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRemove}
            aria-label={`${t(REMOVE, lang)} — ${t(PIN_STATUS_LABEL[pin.statusTag], lang)}`}
            className="border-severity-red text-severity-red"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {t(REMOVE, lang)}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{t(VIEW_ONLY, lang)}</span>
        )}
        {failed && <p className="text-xs text-severity-red">{t(SAVE_FAILED, lang)}</p>}
      </div>
    </div>
  );
}

/** One removed pin's row — the restorable counterpart to ActivePinRow, same reasoning. */
function RemovedPinRow({
  pin,
  zone,
  scopedZoneName,
  canModerate,
  failed,
  onRestore,
  lang,
}: {
  pin: CommunityPin;
  zone: Zone;
  scopedZoneName: string | undefined;
  canModerate: boolean;
  failed: boolean;
  onRestore: () => void;
  lang: LanguageCode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 opacity-70">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium line-through">{t(PIN_STATUS_LABEL[pin.statusTag], lang)}</span>
          {!scopedZoneName && (
            <span className="truncate text-xs text-muted-foreground">
              {zone.name}
            </span>
          )}
          <Badge variant="outline" className="text-xs">
            {t(removalLabel(pin.removedReason), lang)}
          </Badge>
        </div>
        {pin.caption && <p className="text-sm break-words">{pin.caption}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {canModerate ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRestore}
            aria-label={`${t(RESTORE, lang)} — ${t(PIN_STATUS_LABEL[pin.statusTag], lang)}`}
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            {t(RESTORE, lang)}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{t(VIEW_ONLY, lang)}</span>
        )}
        {failed && <p className="text-xs text-severity-red">{t(SAVE_FAILED, lang)}</p>}
      </div>
    </div>
  );
}
