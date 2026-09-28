"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { hotlineProblem, instructionsProblem, MAX_HOTLINES, MAX_INSTRUCTIONS } from "@/lib/barangay-details";
import { hotlinesOf } from "@/lib/zone-data-quality";
import { useSetBarangayDetails } from "@/lib/reference-data/use-reference-data";
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
const SAVE: LocalizedText = { en: "Save", fil: "I-save" };
const CLOSE: LocalizedText = { en: "Close", fil: "Isara" };
const SAVED: LocalizedText = {
  en: "Saved — residents see it the next time their app opens.",
  fil: "Na-save — makikita ito ng mga residente sa susunod na buksan nila ang app.",
};

const TEXTAREA_CLASS =
  "w-full rounded-md border-2 border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring md:text-sm";

/**
 * An official fills in what their barangay's residents call and read: up to
 * three hotline numbers and the evacuation instructions. It checks the
 * database's rules first, so the official reads a problem in their own
 * language; set_barangay_details checks them again.
 */
export function BarangayDetailsForm({ zone, onClose }: { zone: Zone; onClose: () => void }) {
  const { lang } = useLanguage();
  const saveDetails = useSetBarangayDetails();
  const [numbers, setNumbers] = useState<string[]>(() => {
    const current = hotlinesOf(zone);
    return Array.from({ length: MAX_HOTLINES }, (_, i) => current[i] ?? "");
  });
  const [en, setEn] = useState(zone.evacuationRouteText.en);
  const [fil, setFil] = useState(zone.evacuationRouteText.fil);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // A second tap can land before the disabled button re-renders.
  const busy = useRef(false);

  async function save() {
    if (busy.current) return;
    setSaved(false);
    const filled = numbers.map((number) => number.trim()).filter((number) => number !== "");
    const local = filled.map(hotlineProblem).find((found) => found !== null) ?? instructionsProblem({ en, fil });
    if (local) {
      setProblem(t(local, lang));
      return;
    }
    setProblem(null);
    busy.current = true;
    setSaving(true);
    try {
      const result = await saveDetails({ zoneId: zone.id, hotlines: filled, instructions: { en, fil } });
      if (result.ok) setSaved(true);
      else setProblem(friendlyError(result.error, lang));
    } catch (error) {
      setProblem(friendlyError(error instanceof Error ? error.message : String(error), lang));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

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
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={value}
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
          lang="en"
          rows={4}
          maxLength={MAX_INSTRUCTIONS}
          className={TEXTAREA_CLASS}
          value={en}
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
          onChange={(event) => setFil(event.target.value)}
        />
      </div>
      <p lang={lang} className="text-xs text-muted-foreground">
        {t(HINT, lang)}
      </p>
      {problem && (
        <p role="alert" lang={lang} className="text-sm text-destructive">
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
