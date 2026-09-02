"use client";

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

const HAZARD_TYPE_ORDER: HazardType[] = ["flood", "landslide", "storm_surge"];

const HAZARD_TYPE_SELECTOR_LABEL: LocalizedText = {
  en: "Hazard type shown on map",
  fil: "Uri ng hazard na ipinapakita sa mapa",
};

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
      className="flex gap-4"
      aria-label={t(HAZARD_TYPE_SELECTOR_LABEL, lang)}
    >
      {HAZARD_TYPE_ORDER.map((type) => (
        <div key={type} className="flex items-center gap-2">
          <RadioGroupItem value={type} id={`hazard-type-${type}`} />
          <Label htmlFor={`hazard-type-${type}`}>{t(HAZARD_TYPE_LABEL[type], lang)}</Label>
        </div>
      ))}
    </RadioGroup>
  );
}
