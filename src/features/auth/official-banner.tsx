"use client";

import Link from "next/link";
import { ArrowRight, Building2, Home, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useOfficialRole, type OfficialRole } from "@/lib/auth/use-official-role";
import { useZones } from "@/lib/reference-data/use-reference-data";
import type { LocalizedText, Zone } from "@/lib/types";

const OPEN: LocalizedText = { en: "Open your dashboard", fil: "Buksan ang iyong dashboard" };
const SIGNED_IN_AS: Record<OfficialRole["level"], LocalizedText> = {
  admin: { en: "You're signed in as the system admin.", fil: "Naka-sign in ka bilang system admin." },
  municipality: { en: "You're signed in as the municipal official for {area}.", fil: "Naka-sign in ka bilang opisyal ng munisipyo ng {area}." },
  barangay: { en: "You're signed in as the barangay official for {area}.", fil: "Naka-sign in ka bilang opisyal ng barangay ng {area}." },
};
const ICON = { admin: ShieldCheck, municipality: Building2, barangay: Home };

function areaName(role: OfficialRole, zones: Zone[]): string {
  if (role.level === "barangay") return zones.find((z) => z.psgcBarangayCode === role.areaCode)?.name ?? role.areaCode;
  return zones.find((z) => z.psgcBarangayCode.startsWith(role.areaCode))?.municipalityName ?? role.areaCode;
}

/**
 * On the resident home screen, for an official only: who they are signed in
 * as and the way to their dashboard, which was otherwise a URL to know.
 * Residents see nothing.
 */
export function OfficialBanner() {
  const { lang } = useLanguage();
  const role = useOfficialRole();
  const zones = useZones();
  if (!role) return null;
  const Icon = ICON[role.level];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-sky-500/40 bg-sky-500/10 p-3">
      <p lang={lang} className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        {t(SIGNED_IN_AS[role.level], lang).replace("{area}", areaName(role, zones))}
      </p>
      <Button asChild size="lg">
        <Link href="/admin">
          <span lang={lang}>{t(OPEN, lang)}</span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
