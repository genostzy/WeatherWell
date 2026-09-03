"use client";

import { useState, type ChangeEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { PIN_STATUS_ORDER, PIN_STATUS_LABEL, type PinStatusTag } from "@/lib/community-pin";
import type { LocalizedText } from "@/lib/types";

const FORM_TITLE: LocalizedText = { en: "Report flood conditions here", fil: "Iulat ang kondisyon ng baha dito" };
const STATUS_LABEL: LocalizedText = { en: "What's happening?", fil: "Ano ang nangyayari?" };
const CAPTION_LABEL: LocalizedText = { en: "Short description", fil: "Maikling paglalarawan" };
const CAPTION_PLACEHOLDER: LocalizedText = {
  en: "e.g. Water already knee-deep near the market",
  fil: "hal. Tuhod na ang tubig malapit sa palengke",
};
const PHOTO_LABEL: LocalizedText = { en: "Photo (optional)", fil: "Larawan (opsyonal)" };
const PHOTO_NOTE: LocalizedText = {
  en: "Stays on this device only — never uploaded.",
  fil: "Dito lang sa device na ito mananatili — hindi ini-upload.",
};
const UNVERIFIED_NOTE: LocalizedText = {
  en: "Unverified community report, separate from official alerts.",
  fil: "Hindi pa na-verify na ulat ng komunidad, hiwalay sa opisyal na alerto.",
};
const CANCEL: LocalizedText = { en: "Cancel", fil: "Kanselahin" };
const DROP_PIN: LocalizedText = { en: "Drop pin", fil: "Ilagay ang pin" };

/**
 * The confirmation step after a resident taps a spot on the map (see
 * MapCanvas's placing-mode + HomepageMap). Photo attachment is client-side
 * only — read into a data URL and never sent anywhere — per PRD Core
 * Feature #5, so the phone number/consent-notice tradeoffs of real upload
 * don't apply in Phase 1.
 */
export function CommunityPinForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: { statusTag: PinStatusTag; caption: string; photoDataUrl?: string }) => void;
  onCancel: () => void;
}) {
  const { lang } = useLanguage();
  const [statusTag, setStatusTag] = useState<PinStatusTag>("flooded");
  const [caption, setCaption] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPhotoDataUrl(undefined);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDataUrl(typeof reader.result === "string" ? reader.result : undefined);
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card className="w-full max-w-2xl lg:max-w-5xl">
      <CardHeader>
        <CardTitle lang={lang} className="text-base">
          {t(FORM_TITLE, lang)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ statusTag, caption: caption.trim(), photoDataUrl });
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
              className="w-full resize-none rounded-md border-2 border-border bg-background p-2 text-sm placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin-photo" lang={lang}>
              {t(PHOTO_LABEL, lang)}
            </Label>
            <input
              id="pin-photo"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-2 file:border-border file:bg-background file:px-3 file:py-1 file:text-sm file:font-medium"
            />
            <p lang={lang} className="text-xs text-muted-foreground">
              {t(PHOTO_NOTE, lang)}
            </p>
            {photoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a local data: URL, not a remote image next/image would optimize
              <img src={photoDataUrl} alt="" className="h-24 w-auto rounded-md border-2 border-border object-cover" />
            )}
          </div>

          <p lang={lang} className="text-xs text-muted-foreground">
            {t(UNVERIFIED_NOTE, lang)}
          </p>

          <div className="flex gap-2">
            <Button type="submit" size="sm">
              {t(DROP_PIN, lang)}
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
