"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { PIN_STATUS_ORDER, PIN_STATUS_LABEL, type PinStatusTag } from "@/lib/community-pin";
import type { LocalizedText } from "@/lib/types";

const FORM_TITLE: LocalizedText = { en: "Report flood conditions here", fil: "Iulat ang kondisyon ng baha dito" };
const EDIT_TITLE: LocalizedText = { en: "Edit your flood pin", fil: "I-edit ang iyong flood pin" };
const STATUS_LABEL: LocalizedText = { en: "What's happening?", fil: "Ano ang nangyayari?" };
const CAPTION_LABEL: LocalizedText = { en: "Short description", fil: "Maikling paglalarawan" };
const CAPTION_PLACEHOLDER: LocalizedText = {
  en: "e.g. Water already knee-deep near the market",
  fil: "hal. Tuhod na ang tubig malapit sa palengke",
};
const SHARING_NOTE: LocalizedText = {
  en: "This pin — its status, description, and location — is shared with the barangay. Photos can't be attached yet.",
  fil: "Ang pin na ito — status, paglalarawan, at lokasyon — ay ibinabahagi sa barangay. Hindi pa maaaring maglagay ng larawan dito.",
};
const UNVERIFIED_NOTE: LocalizedText = {
  en: "Unverified community report, separate from official alerts.",
  fil: "Hindi pa na-verify na ulat ng komunidad, hiwalay sa opisyal na alerto.",
};
const CANCEL: LocalizedText = { en: "Cancel", fil: "Kanselahin" };
const DROP_PIN: LocalizedText = { en: "Drop pin", fil: "Ilagay ang pin" };
const SAVE_CHANGES: LocalizedText = { en: "Save changes", fil: "I-save ang pagbabago" };

export interface CommunityPinFormValues {
  statusTag: PinStatusTag;
  caption: string;
}

/**
 * Used both for the confirmation step after a resident taps a spot on the map
 * and for editing a pin they already dropped (see HomepageMap, which renders
 * this inside an OverlayDialog so it never sits below the fold).
 *
 * No photo field: pins going live moved status, caption, and location to
 * Postgres, but pin photos are still out of scope pending consent and
 * retention rules, and there is no bucket or grant behind an upload. A form
 * that collected a photo here would mislead the resident into thinking it
 * was part of their report.
 */
export function CommunityPinForm({
  onSubmit,
  onCancel,
  initialValues,
  mode = "create",
}: {
  onSubmit: (values: CommunityPinFormValues) => void;
  onCancel: () => void;
  initialValues?: { statusTag: PinStatusTag; caption: string };
  mode?: "create" | "edit";
}) {
  const { lang } = useLanguage();
  const [statusTag, setStatusTag] = useState<PinStatusTag>(initialValues?.statusTag ?? "flooded");
  const [caption, setCaption] = useState(initialValues?.caption ?? "");

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle lang={lang} className="pr-10 text-base">
          {t(mode === "edit" ? EDIT_TITLE : FORM_TITLE, lang)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ statusTag, caption: caption.trim() });
          }}
        >
          <div className="space-y-2">
            <Label lang={lang}>{t(STATUS_LABEL, lang)}</Label>
            <RadioGroup
              value={statusTag}
              onValueChange={(value) => setStatusTag(value as PinStatusTag)}
              aria-label={t(STATUS_LABEL, lang)}
            >
              {PIN_STATUS_ORDER.map((tag) => (
                <div key={tag} className="flex items-center space-x-3 py-1">
                  <RadioGroupItem value={tag} id={`pin-status-${tag}`} />
                  <Label htmlFor={`pin-status-${tag}`} lang={lang}>
                    {t(PIN_STATUS_LABEL[tag], lang)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin-caption" lang={lang}>
              {t(CAPTION_LABEL, lang)}
            </Label>
            <textarea
              id="pin-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder={t(CAPTION_PLACEHOLDER, lang)}
              lang={lang}
              rows={2}
              maxLength={140}
              required
              className="w-full resize-none rounded-md border-2 border-border bg-background p-2 text-sm placeholder:text-muted-foreground"
            />
          </div>

          <p lang={lang} className="text-xs text-muted-foreground">
            {t(SHARING_NOTE, lang)}
          </p>

          <p lang={lang} className="text-xs text-muted-foreground">
            {t(UNVERIFIED_NOTE, lang)}
          </p>

          <div className="flex gap-2">
            {/* The server refuses a pin without a description (createPin), so the form does too. */}
            <Button type="submit" size="sm" disabled={!caption.trim()}>
              {t(mode === "edit" ? SAVE_CHANGES : DROP_PIN, lang)}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              {t(CANCEL, lang)}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
