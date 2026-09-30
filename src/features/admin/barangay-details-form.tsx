"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import {
  hotlineProblem,
  instructionsProblem,
  MAX_HOTLINES,
  MAX_INSTRUCTIONS,
  PLACEHOLDER_INSTRUCTIONS,
} from "@/lib/barangay-details";
import { hotlinesOf } from "@/lib/zone-data-quality";
import { downstreamChoices, PROFILE_LEVEL_LABEL } from "@/lib/barangay-profile";
import type { HazardLevel } from "@/lib/hazards";
import {
  useHazardsForZone,
  useSetBarangayDetails,
  useSetBarangayProfile,
  useZones,
} from "@/lib/reference-data/use-reference-data";
import type { LocalizedText, Zone } from "@/lib/types";

const HOTLINE: LocalizedText = { en: "Hotline {n}", fil: "Hotline {n}" };
const INSTRUCTIONS_EN: LocalizedText = {
  en: "Evacuation instructions (English)",
  fil: "Mga tagubilin sa paglikas (English)",
};
const INSTRUCTIONS_FIL: LocalizedText = {
  en: "Evacuation instructions (Filipino)",
  fil: "Mga tagubilin sa paglikas (Filipino)",
};
const HINT: LocalizedText = {
  en: "Leave a language blank to show the other one in its place.",
  fil: "Iwanang blangko ang isang wika para ang isa ang ipakita.",
};
const PROFILE: LocalizedText = { en: "Flood profile", fil: "Profile sa baha" };
const PROFILE_FIELDS: { key: "flood" | "landslide" | "stormSurge"; label: LocalizedText }[] = [
  { key: "flood", label: { en: "Flood", fil: "Baha" } },
  { key: "landslide", label: { en: "Landslide", fil: "Pagguho ng lupa" } },
  { key: "stormSurge", label: { en: "Storm surge", fil: "Daluyong" } },
];
const LEVELS: HazardLevel[] = ["low", "medium", "high", "unknown"];
const DOWNSTREAM: LocalizedText = {
  en: "Where does your floodwater go next?",
  fil: "Saan dumadaloy ang baha mula sa inyo?",
};
const NO_DOWNSTREAM: LocalizedText = { en: "None / not sure", fil: "Wala / hindi tiyak" };
const SAVE: LocalizedText = { en: "Save", fil: "I-save" };
const CLOSE: LocalizedText = { en: "Close", fil: "Isara" };
const SAVED: LocalizedText = {
  en: "Saved — residents see it the next time their app opens.",
  fil: "Na-save — makikita ito ng mga residente sa susunod na buksan nila ang app.",
};

const SELECT_CLASS =
  "h-11 w-full rounded-md border-2 border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring md:text-sm";

const TEXTAREA_CLASS =
  "w-full rounded-md border-2 border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring aria-invalid:border-destructive md:text-sm";

/** The seed's placeholder is not the official's own words, so its box starts empty. */
function ownWords(text: string, placeholder: string): string {
  return text === placeholder ? "" : text;
}

/**
 * An official fills in what their barangay's residents call and read: up to
 * three hotline numbers and the evacuation instructions. It checks the
 * database's rules first, so the official reads a problem in their own
 * language, beside the field it is about (WCAG 3.3.1); set_barangay_details
 * checks them again.
 */
export function BarangayDetailsForm({ zone, onClose }: { zone: Zone; onClose: () => void }) {
  const { lang } = useLanguage();
  const saveDetails = useSetBarangayDetails();
  const saveProfile = useSetBarangayProfile();
  const hazards = useHazardsForZone(zone.id);
  const zones = useZones();
  const [choices] = useState(() => downstreamChoices(zone, zones));
  const [levels, setLevels] = useState({
    flood: hazards.flood,
    landslide: hazards.landslide,
    stormSurge: hazards.storm_surge,
  });
  // A link the list does not offer (farther than 20 km) would be refused on save; start at none instead.
  const [downstream, setDownstream] = useState(() =>
    choices.some((choice) => choice.id === zone.downstreamZoneId) ? zone.downstreamZoneId! : ""
  );
  const problemId = useId();
  const [numbers, setNumbers] = useState<string[]>(() => {
    const current = hotlinesOf(zone);
    return Array.from({ length: MAX_HOTLINES }, (_, i) => current[i] ?? "");
  });
  const [en, setEn] = useState(() => ownWords(zone.evacuationRouteText.en, PLACEHOLDER_INSTRUCTIONS.en));
  const [fil, setFil] = useState(() => ownWords(zone.evacuationRouteText.fil, PLACEHOLDER_INSTRUCTIONS.fil));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Which field the problem is about: a hotline's index, or the instructions.
  const [invalid, setInvalid] = useState<number | "instructions" | null>(null);
  const [saved, setSaved] = useState(false);
  // A second tap can land before the disabled button re-renders.
  const busy = useRef(false);
  const hotlineInputs = useRef<(HTMLInputElement | null)[]>([]);
  const englishBox = useRef<HTMLTextAreaElement | null>(null);

  async function save() {
    if (busy.current) return;
    setSaved(false);
    const badIndex = numbers.findIndex((number) => number.trim() !== "" && hotlineProblem(number) !== null);
    if (badIndex >= 0) {
      const label = t(HOTLINE, lang).replace("{n}", String(badIndex + 1));
      setProblem(`${label}: ${t(hotlineProblem(numbers[badIndex])!, lang)}`);
      setInvalid(badIndex);
      hotlineInputs.current[badIndex]?.focus();
      return;
    }
    const instructions = { en: en.trim(), fil: fil.trim() };
    const wrong = instructionsProblem(instructions);
    if (wrong) {
      setProblem(t(wrong, lang));
      setInvalid("instructions");
      englishBox.current?.focus();
      return;
    }
    setProblem(null);
    setInvalid(null);
    busy.current = true;
    setSaving(true);
    try {
      const hotlines = numbers.map((number) => number.trim()).filter((number) => number !== "");
      const result = await saveDetails({ zoneId: zone.id, hotlines, instructions });
      if (!result.ok) {
        setProblem(friendlyError(result.error, lang));
        return;
      }
      const profile = await saveProfile({ zoneId: zone.id, ...levels, downstreamZoneId: downstream || null });
      if (profile.ok) setSaved(true);
      else setProblem(friendlyError(profile.error, lang));
    } catch (error) {
      setProblem(friendlyError(error instanceof Error ? error.message : String(error), lang));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const describedBy = (field: number | "instructions") => (invalid === field ? problemId : undefined);

  return (
    <form
      className="space-y-3 rounded-md border-2 border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {numbers.map((value, i) => (
        <div key={i} className="space-y-1">
          <Label htmlFor={`hotline-${i + 1}`}>{t(HOTLINE, lang).replace("{n}", String(i + 1))}</Label>
          <Input
            id={`hotline-${i + 1}`}
            ref={(element) => {
              hotlineInputs.current[i] = element;
            }}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={value}
            aria-invalid={invalid === i || undefined}
            aria-describedby={describedBy(i)}
            onChange={(event) =>
              setNumbers((current) => current.map((number, j) => (j === i ? event.target.value : number)))
            }
          />
        </div>
      ))}
      <div className="space-y-1">
        <Label htmlFor="instructions-en" lang={lang}>
          {t(INSTRUCTIONS_EN, lang)}
        </Label>
        <textarea
          id="instructions-en"
          ref={englishBox}
          lang="en"
          rows={4}
          maxLength={MAX_INSTRUCTIONS}
          className={TEXTAREA_CLASS}
          value={en}
          aria-invalid={invalid === "instructions" || undefined}
          aria-describedby={describedBy("instructions")}
          onChange={(event) => setEn(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="instructions-fil" lang={lang}>
          {t(INSTRUCTIONS_FIL, lang)}
        </Label>
        <textarea
          id="instructions-fil"
          lang="fil"
          rows={4}
          maxLength={MAX_INSTRUCTIONS}
          className={TEXTAREA_CLASS}
          value={fil}
          aria-invalid={invalid === "instructions" || undefined}
          aria-describedby={describedBy("instructions")}
          onChange={(event) => setFil(event.target.value)}
        />
      </div>
      <p lang={lang} className="text-xs text-muted-foreground">
        {t(HINT, lang)}
      </p>
      <fieldset className="space-y-3">
        <legend lang={lang} className="text-sm font-semibold">
          {t(PROFILE, lang)}
        </legend>
        {PROFILE_FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`profile-${key}`} lang={lang}>
              {t(label, lang)}
            </Label>
            <select
              id={`profile-${key}`}
              lang={lang}
              className={SELECT_CLASS}
              value={levels[key]}
              onChange={(event) => setLevels((current) => ({ ...current, [key]: event.target.value as HazardLevel }))}
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(PROFILE_LEVEL_LABEL[level], lang)}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="profile-downstream" lang={lang}>
            {t(DOWNSTREAM, lang)}
          </Label>
          <select
            id="profile-downstream"
            className={SELECT_CLASS}
            value={downstream}
            onChange={(event) => setDownstream(event.target.value)}
          >
            <option value="" lang={lang}>
              {t(NO_DOWNSTREAM, lang)}
            </option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {`${choice.name} (${choice.municipalityName})`}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      {problem && (
        <p id={problemId} role="alert" lang={lang} className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {saved && (
        <p role="status" lang={lang} className="text-sm">
          {t(SAVED, lang)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          <span lang={lang}>{t(SAVE, lang)}</span>
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          <span lang={lang}>{t(CLOSE, lang)}</span>
        </Button>
      </div>
    </form>
  );
}
