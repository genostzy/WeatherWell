"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Phone, Settings2 } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import {
  CENTER_STATUS_LABEL,
  CENTER_STATUS_ORDER,
  CENTER_STATUS_CLASS,
  resolveEffectiveCenterStatus,
} from "@/lib/center-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DonutChart } from "./charts/donut-chart";
import { useSetCenterStatus } from "@/lib/reference-data/use-reference-data";
import { useOfficial } from "@/lib/auth/official-context";
import { isInArea } from "@/lib/auth/official";
import type { CenterStatus, LanguageCode, LocalizedText, Zone } from "@/lib/types";
import { useHeadcountCommit } from "./use-headcount-commit";

const TITLE: LocalizedText = { en: "Evacuation Management", fil: "Pamamahala ng Evacuation" };
const SUBTITLE: LocalizedText = {
  en: "Capacity across every center — editable here, visible to residents immediately",
  fil: "Kapasidad ng bawat center — mae-edit dito, agad makikita ng mga residente",
};
const CAPACITY: LocalizedText = { en: "Capacity", fil: "Kapasidad" };
const MANAGE_ZONE: LocalizedText = { en: "Manage zone", fil: "Pamahalaan ang zone" };
const CENTERS: LocalizedText = { en: "evacuation centers", fil: "evacuation centers" };
const WITH_SPACE: LocalizedText = { en: "still have space", fil: "may espasyo pa" };
const HEADCOUNT: LocalizedText = { en: "Headcount", fil: "Bilang ng tao" };
const HEADCOUNT_HINT: LocalizedText = {
  en: "Entering a headcount derives the status automatically instead of picking it manually",
  fil: "Ang paglagay ng bilang ay awtomatikong magtatakda ng status sa halip na piliin nang manu-mano",
};
const CLEAR: LocalizedText = { en: "Clear", fil: "I-clear" };
const OF: LocalizedText = { en: "of", fil: "sa" };
const SPOTS: LocalizedText = { en: "spots", fil: "espasyo" };
const SAVE_FAILED: LocalizedText = { en: "Could not save — try again.", fil: "Hindi na-save — subukan ulit." };

const CENTER_STATUS_COLOR: Record<CenterStatus, string> = {
  space_available: "#22c55e",
  limited: "#eab308",
  full: "#dc2626",
  unknown: "#6b7280",
};

export function EvacuationManagementPanel({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const official = useOfficial();
  // Only zones the signed-in official can act on — a barangay official's own
  // barangay, or every barangay in a municipal official's town. The database
  // enforces the real limit; this only decides what's shown here.
  const inAreaZones = zones.filter((zone) => isInArea(zone.psgcBarangayCode, official.areaCode));

  // Reflects each zone's live headcount, carried through reference data as
  // zone.currentOccupancy, same as every other read-only surface.
  const effectiveStatuses = inAreaZones.map((zone) =>
    resolveEffectiveCenterStatus(zone.centerStatus, zone.evacuationCenterCapacity, zone.currentOccupancy)
  );
  const countByStatus = (status: CenterStatus) =>
    effectiveStatuses.filter((value) => value === status).length;
  const withSpace = countByStatus("space_available");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t(SUBTITLE, lang)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <DonutChart
          label={t(CAPACITY, lang)}
          centerValue={`${withSpace}/${inAreaZones.length}`}
          centerLabel={t(WITH_SPACE, lang)}
          segments={CENTER_STATUS_ORDER.map((status) => ({
            label: t(CENTER_STATUS_LABEL[status], lang),
            value: countByStatus(status),
            color: CENTER_STATUS_COLOR[status],
          }))}
        />

        <p className="text-xs text-muted-foreground">
          {inAreaZones.length} {t(CENTERS, lang)}
        </p>

        {inAreaZones.map((zone) => (
          <EvacuationCenterRow key={zone.id} zone={zone} lang={lang} />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * One zone's status/headcount controls. Its own component, not inline in
 * EvacuationManagementPanel's zones.map(): the occupancy and save-error state
 * below are real useState calls at the top of a component body, not hooks
 * called from inside a loop.
 *
 * The typed headcount is seeded from zone.currentOccupancy (the last value
 * carried through reference data) and then tracked in this component's own
 * state as the admin edits it — an occupancy write doesn't itself refetch or
 * patch reference data, so this state only reflects the server again after
 * the next fetch/reload. Typing here derives the status shown immediately;
 * the database write via setCenterOccupancy happens once the value is
 * committed (see useHeadcountCommit). A manual status pick is different: it
 * goes through useSetCenterStatus, which patches zone.centerStatus in
 * ReferenceDataProvider's state once the write is confirmed (R1), so
 * centerStatus below reflects it without a reload.
 */
function EvacuationCenterRow({ zone, lang }: { zone: Zone; lang: LanguageCode }) {
  const [statusError, setStatusError] = useState(false);
  const [occupancyError, setOccupancyError] = useState(false);
  const setCenterStatus = useSetCenterStatus();
  // Written once per committed value, not per keystroke (M9).
  const headcount = useHeadcountCommit(zone.currentOccupancy, writeOccupancy);
  const occupancy = headcount.occupancy;
  const isTrackingHeadcount = occupancy !== undefined;
  const centerStatus = resolveEffectiveCenterStatus(zone.centerStatus, zone.evacuationCenterCapacity, occupancy);

  // The status write goes through useSetCenterStatus, which patches the
  // zone's centerStatus in ReferenceDataProvider's state once the database
  // confirms it — see R1 there.
  async function handleStatusChange(value: CenterStatus) {
    setStatusError(false);
    const result = await setCenterStatus({ zoneId: zone.id, status: value });
    if (!result.ok) setStatusError(true);
  }

  async function writeOccupancy(value: number | undefined) {
    setOccupancyError(false);
    const { setCenterOccupancy } = await import("@/app/actions/set-center");
    const result = await setCenterOccupancy({ zoneId: zone.id, occupancy: value ?? null });
    if (!result.ok) setOccupancyError(true);
  }

  return (
    <div className="space-y-2 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{zone.name}</p>
          <p className="truncate text-sm text-muted-foreground">{zone.evacuationCenterName}</p>
          <a
            href={`tel:${zone.hotlineNumber}`}
            className="flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            <Phone aria-hidden="true" className="h-3.5 w-3.5" />
            {zone.hotlineNumber}
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            aria-hidden="true"
            className={`rounded px-2 py-0.5 text-xs font-medium ${CENTER_STATUS_CLASS[centerStatus]}`}
          >
            {t(CENTER_STATUS_LABEL[centerStatus], lang)}
            {isTrackingHeadcount && ` · ${occupancy} ${t(OF, lang)} ${zone.evacuationCenterCapacity}`}
          </span>
          <Select
            value={centerStatus}
            disabled={isTrackingHeadcount}
            onValueChange={(value) => void handleStatusChange(value as CenterStatus)}
          >
            <SelectTrigger aria-label={`${t(CAPACITY, lang)} — ${zone.name}`} className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CENTER_STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(CENTER_STATUS_LABEL[status], lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/zone/${zone.id}`}>
              <Settings2 aria-hidden="true" className="h-4 w-4" />
              {t(MANAGE_ZONE, lang)}
            </Link>
          </Button>
        </div>
      </div>
      {statusError && <p className="text-xs text-severity-red">{t(SAVE_FAILED, lang)}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`headcount-${zone.id}`} className="text-xs text-muted-foreground">
            {t(HEADCOUNT, lang)} ({t(OF, lang)} {zone.evacuationCenterCapacity} {t(SPOTS, lang)})
          </Label>
          <Input
            id={`headcount-${zone.id}`}
            type="number"
            min={0}
            max={zone.evacuationCenterCapacity}
            className="w-28"
            value={occupancy ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              headcount.change(raw === "" ? undefined : Number(raw));
            }}
            onBlur={() => headcount.commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") headcount.commit();
            }}
          />
        </div>
        {isTrackingHeadcount && (
          <Button type="button" variant="ghost" size="sm" onClick={() => headcount.set(undefined)}>
            {t(CLEAR, lang)}
          </Button>
        )}
      </div>
      {occupancyError && <p className="text-xs text-severity-red">{t(SAVE_FAILED, lang)}</p>}
      {!isTrackingHeadcount && <p className="text-xs text-muted-foreground">{t(HEADCOUNT_HINT, lang)}</p>}
    </div>
  );
}
