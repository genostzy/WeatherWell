"use client";

import { Info } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { hasRealEvacuationCenter, hasRealHotline } from "@/lib/zone-data-quality";
import type { LocalizedText, Zone } from "@/lib/types";

const ALERTS_ONLY: LocalizedText = {
  en: "Alerts only — your barangay's evacuation details aren't verified yet. You still get alerts and your neighbours' reports.",
  fil: "Alerto lamang — hindi pa beripikado ang detalye ng evacuation ng inyong barangay. Makakatanggap ka pa rin ng alerto at ulat ng mga kapitbahay.",
};

/**
 * Two coverage tiers (H5): a barangay with a real hotline and centre is
 * covered; everywhere else the seed holds placeholders, and residents are
 * told so rather than left to assume the nationwide map means coverage.
 */
export function CoverageNote({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  if (hasRealHotline(zone) && hasRealEvacuationCenter(zone)) return null;
  return (
    <p lang={lang} className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {t(ALERTS_ONLY, lang)}
    </p>
  );
}
