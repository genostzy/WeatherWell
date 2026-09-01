"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LANGUAGES, LANGUAGE_LABEL } from "@/lib/i18n";
import { useLanguage } from "./language-provider";

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="flex gap-2" role="group" aria-label="Language">
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
          <TooltipContent>Switch to {LANGUAGE_LABEL[code]}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
