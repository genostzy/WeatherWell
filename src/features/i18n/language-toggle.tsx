"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LANGUAGES, LANGUAGE_LABEL, t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";
import { useLanguage } from "./language-provider";

const LANGUAGE_GROUP: LocalizedText = { en: "Language", fil: "Wika" };
const SWITCH_TO: LocalizedText = { en: "Switch to", fil: "Lumipat sa" };

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="flex gap-2" role="group" aria-label={t(LANGUAGE_GROUP, lang)}>
      {LANGUAGES.map((code) => (
        <Tooltip key={code}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={code === lang ? "default" : "outline"}
              aria-pressed={code === lang}
              onClick={() => setLang(code)}
            >
              {LANGUAGE_LABEL[code]}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t(SWITCH_TO, lang)} {LANGUAGE_LABEL[code]}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
