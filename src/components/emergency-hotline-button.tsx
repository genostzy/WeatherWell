"use client";

import { Phone } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const CALL_HOTLINE: LocalizedText = {
  en: "Call emergency hotline",
  fil: "Tawagan ang emergency hotline",
};

export function EmergencyHotlineButton({ hotlineNumber }: { hotlineNumber: string }) {
  const { lang } = useLanguage();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={`tel:${hotlineNumber}`}
          aria-label={t(CALL_HOTLINE, lang)}
          className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-severity-red text-white shadow-lg"
        >
          <Phone className="h-6 w-6" aria-hidden="true" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="left">{t(CALL_HOTLINE, lang)}</TooltipContent>
    </Tooltip>
  );
}
