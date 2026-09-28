"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/features/i18n/language-provider";
import { PhotoLightbox } from "@/features/homepage-map/photo-lightbox";
import { getBrowserClient } from "@/lib/supabase/browser";
import { t } from "@/lib/i18n";
import type { CommunityPin } from "@/lib/community-pins";
import type { LocalizedText } from "@/lib/types";

const VIEW_PHOTO: LocalizedText = { en: "View photo", fil: "Tingnan ang larawan" };
const UNAVAILABLE: LocalizedText = { en: "Photo unavailable", fil: "Hindi makita ang larawan" };
const OFFICIAL_NOTE: LocalizedText = {
  en: "Unverified photo sent by a resident. Deleted after 7 days.",
  fil: "Hindi pa beripikadong larawan mula sa residente. Buburahin pagkalipas ng 7 araw.",
};

/** One hour: long enough to look, short enough that a copied link soon stops working. */
const LINK_SECONDS = 3600;

/**
 * A pin's photo for officials. The bucket is private and only an official's
 * session may read it, so the link is signed here, with that session; a
 * resident's phone never gets one.
 */
export function PinPhotoThumb({ pin }: { pin: CommunityPin }) {
  const { lang } = useLanguage();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!pin.photoPath) return;
    let cancelled = false;
    getBrowserClient()
      .storage.from("pin-photos")
      .createSignedUrl(pin.photoPath, LINK_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) setFailed(true);
        else setUrl(data.signedUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pin.photoPath]);

  if (!pin.photoPath) return null;
  if (failed) {
    return (
      <p lang={lang} className="text-xs text-muted-foreground">
        {t(UNAVAILABLE, lang)}
      </p>
    );
  }
  if (!url) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 text-xs underline underline-offset-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, not a static asset next/image could optimize */}
        <img src={url} alt="" className="h-12 w-12 rounded object-cover" />
        <span lang={lang}>{t(VIEW_PHOTO, lang)}</span>
      </button>
      {open && (
        <PhotoLightbox
          photoDataUrl={url}
          statusTag={pin.statusTag}
          caption={pin.caption}
          note={OFFICIAL_NOTE}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
