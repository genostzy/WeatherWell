"use client";

import { OverlayDialog } from "@/components/overlay-dialog";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { PIN_STATUS_LABEL, type PinStatusTag } from "@/lib/community-pin";
import type { LocalizedText } from "@/lib/types";

const PHOTO_LABEL: LocalizedText = { en: "Pin photo", fil: "Larawan ng pin" };
const CLOSE: LocalizedText = { en: "Close photo", fil: "Isara ang larawan" };
const UNVERIFIED_NOTE: LocalizedText = {
  en: "Unverified community photo — kept on the device that reported it, never uploaded.",
  fil: "Hindi pa na-verify na larawan ng komunidad — nasa device lang ng nag-ulat, hindi ini-upload.",
};

/** Full-size view of a community pin's photo — the popup thumbnail is far too small to judge actual water depth from. */
export function PhotoLightbox({
  photoDataUrl,
  statusTag,
  caption,
  note = UNVERIFIED_NOTE,
  onClose,
}: {
  photoDataUrl: string;
  statusTag: PinStatusTag;
  caption: string;
  /** What the viewer should know about where the photo came from. */
  note?: LocalizedText;
  onClose: () => void;
}) {
  const { lang } = useLanguage();

  return (
    <OverlayDialog
      onClose={onClose}
      label={t(PHOTO_LABEL, lang)}
      closeLabel={t(CLOSE, lang)}
      className="max-w-3xl"
    >
      <div className="space-y-3 rounded-xl border-2 border-border bg-card p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, not a remote image next/image would optimize */}
        <img
          src={photoDataUrl}
          alt={caption || t(PHOTO_LABEL, lang)}
          className="max-h-[70vh] w-full rounded-md object-contain"
        />
        <div className="space-y-1">
          <p className="font-medium">{t(PIN_STATUS_LABEL[statusTag], lang)}</p>
          {caption && <p className="text-sm">{caption}</p>}
          <p lang={lang} className="text-xs text-muted-foreground">
            {t(note, lang)}
          </p>
        </div>
      </div>
    </OverlayDialog>
  );
}
