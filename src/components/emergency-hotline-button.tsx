"use client";

import { Phone } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { hasRealHotline } from "@/lib/zone-data-quality";
import type { LocalizedText } from "@/lib/types";

const CALL_HOTLINE: LocalizedText = {
  en: "Call emergency hotline",
  fil: "Tawagan ang emergency hotline",
};

export function EmergencyHotlineButton({ hotlineNumber }: { hotlineNumber: string }) {
  const { lang } = useLanguage();

  // A placeholder hotline is not a degraded feature, it is a wrong answer:
  // the resident taps a red emergency button and nothing rings. Render
  // nothing instead, so the absence is obvious before an emergency rather
  // than during one. See src/lib/zone-data-quality.ts.
  if (!hasRealHotline({ hotlineNumber } as Parameters<typeof hasRealHotline>[0])) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={`tel:${hotlineNumber}`}
          aria-label={t(CALL_HOTLINE, lang)}
          className="fixed bottom-[4.5rem] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-severity-red text-white shadow-lg lg:bottom-4"
        >
          <Phone className="h-6 w-6" aria-hidden="true" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="left">{t(CALL_HOTLINE, lang)}</TooltipContent>
    </Tooltip>
  );
}
