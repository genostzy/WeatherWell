"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import {
  FLOOD_STATUS_TAGS,
  PIN_KIND_LABEL,
  PIN_KIND_ORDER,
  PIN_STATUS_LABEL,
  pinKindOf,
  type PinKind,
  type PinStatusTag,
} from "@/lib/community-pin";
import type { LocalizedText } from "@/lib/types";
import { PIN_PHOTO_NOTICE_KEY, shrinkPhoto, uploadPinPhoto } from "@/lib/pin-photo";

const FORM_TITLE: LocalizedText = { en: "Report flood conditions here", fil: "Iulat ang kondisyon ng baha dito" };
const EDIT_TITLE: LocalizedText = { en: "Edit your flood pin", fil: "I-edit ang iyong flood pin" };
const KIND_LABEL: LocalizedText = { en: "What's happening?", fil: "Ano ang nangyayari?" };
const WATER_LABEL: LocalizedText = { en: "How is the water?", fil: "Kumusta ang tubig?" };
const CAPTION_LABEL: LocalizedText = { en: "Short description", fil: "Maikling paglalarawan" };
const CAPTION_PLACEHOLDER: LocalizedText = {
  en: "e.g. Water already knee-deep near the market",
  fil: "hal. Tuhod na ang tubig malapit sa palengke",
};
const SHARING_NOTE: LocalizedText = {
  en: "This pin — what's happening, the description and the location — is shared with the barangay. A photo, if you add one, goes only to officials.",
  fil: "Ang pin na ito — ang nangyayari, paglalarawan at lokasyon — ay ibinabahagi sa barangay. Ang larawan, kung maglalagay ka, ay para lang sa mga opisyal.",
};
const ADD_PHOTO: LocalizedText = {
  en: "Add photo (only officials see it)",
  fil: "Magdagdag ng larawan (mga opisyal lang ang makakakita)",
};
const REMOVE_PHOTO: LocalizedText = { en: "Remove photo", fil: "Alisin ang larawan" };
const PHOTO_ALT: LocalizedText = { en: "Photo to send", fil: "Larawang ipapadala" };
const PHOTO_NOTICE: LocalizedText = {
  en: "Only officials see this photo. It is deleted after 7 days. Don't include people's faces or plate numbers.",
  fil: "Mga opisyal lang ang makakakita ng larawang ito. Buburahin ito pagkalipas ng 7 araw. Huwag isama ang mukha ng tao o plate number.",
};
const OK: LocalizedText = { en: "OK", fil: "OK" };
const NEEDS_CONNECTION: LocalizedText = {
  en: "Photos need a connection — the pin will be sent without it.",
  fil: "Kailangan ng koneksyon para sa larawan — ipapadala ang pin nang wala nito.",
};
const PHOTO_UNUSABLE: LocalizedText = {
  en: "This photo couldn't be used — send the pin without it, or try another.",
  fil: "Hindi magamit ang larawang ito — ipadala ang pin nang wala nito, o sumubok ng iba.",
};
const UPLOAD_FAILED: LocalizedText = {
  en: "The photo couldn't be sent — drop the pin again to send it without the photo.",
  fil: "Hindi naipadala ang larawan — pindutin muli para ipadala ang pin nang wala nito.",
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
  /** Set only when a photo was uploaded; see pin-photo.ts. */
  photoPath?: string;
}

function noticeSeen(): boolean {
  try {
    return localStorage.getItem(PIN_PHOTO_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Used both for the confirmation step after a resident taps a spot on the map
 * and for editing a pin they already dropped (see HomepageMap, which renders
 * this inside an OverlayDialog so it never sits below the fold).
 *
 * A new pin can carry one photo for officials: shrunk on the phone when
 * picked, uploaded when the pin is sent (online only), and attached by
 * createPin. The first photo on a phone shows a short notice first.
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
  const [kind, setKind] = useState<PinKind>(initialValues ? pinKindOf(initialValues.statusTag) : "flood");
  // The water status is kept while another kind is picked, so switching back does not lose it.
  const [waterTag, setWaterTag] = useState<PinStatusTag>(
    initialValues && pinKindOf(initialValues.statusTag) === "flood" ? initialValues.statusTag : "flooded"
  );
  const statusTag: PinStatusTag = kind === "flood" ? waterTag : kind;
  const [caption, setCaption] = useState(initialValues?.caption ?? "");
  // The shrunk photo, and the local link its preview shows (null where the browser can't make one).
  const [photo, setPhoto] = useState<{ blob: Blob; url: string | null } | null>(null);
  // Held until the resident has read the notice, the first time.
  const [awaitingNotice, setAwaitingNotice] = useState<Blob | null>(null);
  const [photoMessage, setPhotoMessage] = useState<LocalizedText | null>(null);
  const [sending, setSending] = useState(false);
  // A second press can land before the disabled button re-renders.
  const busy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // The link is made when the photo is picked; this lets it go when the photo changes or the form closes.
  const previewUrl = photo?.url;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL?.(previewUrl);
    };
  }, [previewUrl]);

  function attach(shrunk: Blob) {
    setPhoto({ blob: shrunk, url: typeof URL.createObjectURL === "function" ? URL.createObjectURL(shrunk) : null });
    setPhotoMessage(navigator.onLine ? null : NEEDS_CONNECTION);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setPhotoMessage(null);
    try {
      const shrunk = await shrinkPhoto(file);
      if (noticeSeen()) attach(shrunk);
      else setAwaitingNotice(shrunk);
    } catch {
      setPhoto(null);
      setPhotoMessage(PHOTO_UNUSABLE);
    }
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoMessage(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function send() {
    if (busy.current) return;
    const values: CommunityPinFormValues = { statusTag, caption: caption.trim() };
    if (photo && navigator.onLine) {
      busy.current = true;
      setSending(true);
      const path = await uploadPinPhoto(photo.blob);
      busy.current = false;
      setSending(false);
      if (!path) {
        removePhoto();
        setPhotoMessage(UPLOAD_FAILED);
        return;
      }
      values.photoPath = path;
    }
    onSubmit(values);
  }

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
            void send();
          }}
        >
          <div className="space-y-2">
            <Label lang={lang}>{t(KIND_LABEL, lang)}</Label>
            <RadioGroup value={kind} onValueChange={(value) => setKind(value as PinKind)} aria-label={t(KIND_LABEL, lang)}>
              {PIN_KIND_ORDER.map((option) => (
                <div key={option} className="flex items-center space-x-3 py-1">
                  <RadioGroupItem value={option} id={`pin-kind-${option}`} />
                  <Label htmlFor={`pin-kind-${option}`} lang={lang}>
                    {t(PIN_KIND_LABEL[option], lang)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {kind === "flood" && (
          <div className="space-y-2">
            <Label lang={lang}>{t(WATER_LABEL, lang)}</Label>
            <RadioGroup
              value={waterTag}
              onValueChange={(value) => setWaterTag(value as PinStatusTag)}
              aria-label={t(WATER_LABEL, lang)}
            >
              {FLOOD_STATUS_TAGS.map((tag) => (
                <div key={tag} className="flex items-center space-x-3 py-1">
                  <RadioGroupItem value={tag} id={`pin-status-${tag}`} />
                  <Label htmlFor={`pin-status-${tag}`} lang={lang}>
                    {t(PIN_STATUS_LABEL[tag], lang)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          )}

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
              className="w-full resize-none rounded-md border-2 border-input bg-background p-2 text-sm placeholder:text-muted-foreground"
            />
          </div>

          {mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="pin-photo" lang={lang}>
                {t(ADD_PHOTO, lang)}
              </Label>
              <input
                ref={fileInput}
                id="pin-photo"
                type="file"
                accept="image/*"
                capture="environment"
                className="block w-full text-sm"
                onChange={(event) => void pick(event.target.files?.[0])}
              />
              {awaitingNotice && (
                <div role="alertdialog" aria-label={t(ADD_PHOTO, lang)} className="space-y-2 rounded-md border-2 border-border p-2">
                  <p lang={lang} className="text-sm">
                    {t(PHOTO_NOTICE, lang)}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      try {
                        localStorage.setItem(PIN_PHOTO_NOTICE_KEY, "1");
                      } catch {
                        // The notice shows again next time; nothing else depends on it.
                      }
                      attach(awaitingNotice);
                      setAwaitingNotice(null);
                    }}
                  >
                    {t(OK, lang)}
                  </Button>
                </div>
              )}
              {photo && (
                <div className="flex items-center gap-2">
                  {photo.url && (
                    // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL of the resident's own photo
                    <img src={photo.url} alt={t(PHOTO_ALT, lang)} className="h-16 w-16 rounded-md object-cover" />
                  )}
                  {!photo.url && <span role="img" aria-label={t(PHOTO_ALT, lang)} className="h-16 w-16 rounded-md bg-muted" />}
                  <Button type="button" size="sm" variant="outline" onClick={removePhoto}>
                    {t(REMOVE_PHOTO, lang)}
                  </Button>
                </div>
              )}
              {photoMessage && (
                <p role="status" lang={lang} className="text-xs">
                  {t(photoMessage, lang)}
                </p>
              )}
            </div>
          )}

          <p lang={lang} className="text-xs text-muted-foreground">
            {t(SHARING_NOTE, lang)}
          </p>

          <p lang={lang} className="text-xs text-muted-foreground">
            {t(UNVERIFIED_NOTE, lang)}
          </p>

          <div className="flex gap-2">
            {/* The server refuses a pin without a description (createPin), so the form does too. */}
            <Button type="submit" size="sm" disabled={!caption.trim() || Boolean(awaitingNotice)} loading={sending}>
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
