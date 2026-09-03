"use client";

import { Droplet, Mountain, Waves } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { HazardType, LocalizedText } from "@/lib/types";

const HAZARD_TYPE_LABEL: Record<HazardType, LocalizedText> = {
  flood: { en: "Flood", fil: "Baha" },
  landslide: { en: "Landslide", fil: "Guho" },
  storm_surge: { en: "Storm Surge", fil: "Storm Surge" },
};

const HAZARD_TYPE_ICON: Record<HazardType, typeof Droplet> = {
  flood: Droplet,
  landslide: Mountain,
  storm_surge: Waves,
};

const HAZARD_TYPE_ORDER: HazardType[] = ["flood", "landslide", "storm_surge"];

const HAZARD_TYPE_SELECTOR_LABEL: LocalizedText = {
  en: "Hazard type shown on map",
  fil: "Uri ng hazard na ipinapakita sa mapa",
};

/**
 * Icon-only vertical control meant to float inside the map itself (see
 * HomepageMap) — text labels move to a visually-hidden span so the control
 * stays compact while keeping its accessible name for screen readers.
 */
export function HazardTypeSelector({
  value,
  onChange,
}: {
  value: HazardType;
  onChange: (type: HazardType) => void;
}) {
  const { lang } = useLanguage();

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as HazardType)}
      className="flex w-auto flex-col gap-2"
      aria-label={t(HAZARD_TYPE_SELECTOR_LABEL, lang)}
    >
      {HAZARD_TYPE_ORDER.map((type) => {
        const Icon = HAZARD_TYPE_ICON[type];
        return (
          <div key={type}>
            <RadioGroupItem
              value={type}
              id={`hazard-type-${type}`}
              className="peer sr-only"
            />
            <Label
              htmlFor={`hazard-type-${type}`}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-border bg-background/90 text-foreground shadow-md peer-aria-checked:border-severity-orange peer-aria-checked:bg-severity-orange/20 peer-aria-checked:text-severity-orange"
            >
              <Icon aria-hidden="true" className="h-5 w-5" />
              <span className="sr-only">{t(HAZARD_TYPE_LABEL[type], lang)}</span>
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}
