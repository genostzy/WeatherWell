"use client";

import { Droplet, Mountain, Waves, Gauge } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { HazardType, LocalizedText } from "@/lib/types";

const HAZARD_TYPE_LABEL: Record<HazardType, LocalizedText> = {
  flood: { en: "Flood", fil: "Baha" },
  landslide: { en: "Landslide", fil: "Guho" },
  storm_surge: { en: "Storm Surge", fil: "Storm Surge" },
  dam_release: { en: "Dam Release", fil: "Paglabas ng Dam" },
};

const HAZARD_TYPE_ICON: Record<HazardType, typeof Droplet> = {
  flood: Droplet,
  landslide: Mountain,
  storm_surge: Waves,
  dam_release: Gauge,
};

const HAZARD_TYPE_ORDER: HazardType[] = ["flood", "landslide", "storm_surge", "dam_release"];

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
            {/*
              RadioGroupItem's own base classes (see ui/radio-group.tsx)
              already carry a visible size (size-6) and positioning
              (relative) — plain `sr-only` doesn't reliably win against
              them, because tailwind-merge only dedupes classes within the
              same conflict group, and `sr-only` isn't grouped against
              `size-*`/position utilities the way e.g. `size-0` would be.
              The result without the `!` overrides below: a bare, unstyled
              24px circle renders at the radio's own in-flow position
              instead of staying invisible, badly enough to visibly
              overlap the map's search bar on a narrow phone screen. The
              `!` (important) modifiers force the override regardless of
              generated CSS order.
            */}
            <RadioGroupItem
              value={type}
              id={`hazard-type-${type}`}
              className="peer sr-only !absolute !size-px"
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
