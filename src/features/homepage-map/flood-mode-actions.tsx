"use client";

import Link from "next/link";
import { Building2, Phone } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useActiveAlertForZone } from "@/lib/alerts-store";
import { SEVERITY_HEX } from "@/lib/severity";
import { hasRealHotline } from "@/lib/zone-data-quality";
import { CheckInPanel } from "@/features/evacuation/check-in-panel";
import type { LocalizedText, Zone } from "@/lib/types";

const GO: LocalizedText = { en: "Go to evacuation centre", fil: "Pumunta sa evacuation center" };
const CALL_BARANGAY: LocalizedText = { en: "Call your barangay", fil: "Tawagan ang barangay" };
const CALL_911: LocalizedText = { en: "Call 911", fil: "Tumawag sa 911" };

/**
 * Flood mode: at Warning or Evacuate, the things to do next, big enough
 * to hit with a wet thumb, straight under the alert. Below that level the
 * home screen is unchanged; these would only crowd a calm day.
 */
export function FloodModeActions({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const alert = useActiveAlertForZone(zone.id);
  if (!alert || (alert.severity !== "red" && alert.severity !== "evacuate")) return null;

  const color = SEVERITY_HEX[alert.severity];
  const realHotline = hasRealHotline(zone);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          href="/evacuation"
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl px-4 text-base font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-ring"
          style={{ backgroundColor: color }}
        >
          <Building2 aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span lang={lang}>{t(GO, lang)}</span>
        </Link>
        <a
          href={`tel:${realHotline ? zone.hotlineNumber : "911"}`}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-4 text-base font-bold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
          style={{ borderColor: color }}
        >
          <Phone aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span lang={lang}>{t(realHotline ? CALL_BARANGAY : CALL_911, lang)}</span>
        </a>
      </div>
      {/* "I'm safe" / "I need help" feeds the barangay's headcount; it used to be only on the Evacuate page. */}
      <CheckInPanel zoneId={zone.id} />
    </div>
  );
}
