"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { ChangeBarangayDialog } from "@/features/zones/change-barangay-dialog";
import { t } from "@/lib/i18n";
import type { LocalizedText, Zone } from "@/lib/types";

const CHANGE: LocalizedText = { en: "Change", fil: "Palitan" };
const VIEWING: LocalizedText = {
  en: "Viewing {name}. Your alerts still come for {mine}.",
  fil: "Tinitingnan ang {name}. Para pa rin sa {mine} ang iyong mga alerto.",
};
const BACK: LocalizedText = { en: "Back to my barangay", fil: "Bumalik sa aking barangay" };
const MY_LOCATION: LocalizedText = { en: "My location", fil: "Aking lokasyon" };
const YOURE_IN: LocalizedText = { en: "You're in {name} now.", fil: "Nasa {name} ka ngayon." };
const VIEW: LocalizedText = { en: "View", fil: "Tingnan" };

/**
 * Which barangay the home screen shows, and the ways to another: change my
 * barangay, go back to it from one being viewed, or view the one GPS puts
 * me in. Nothing here switches the screen by itself.
 */
export function BarangayBar({
  shownZone,
  myZone,
  whereYouAre,
}: {
  shownZone: Zone;
  myZone: Zone;
  whereYouAre: Zone | null;
}) {
  const { lang } = useLanguage();
  const [changing, setChanging] = useState(false);
  const viewing = shownZone.id !== myZone.id;
  const hrefFor = (zone: Zone) => (zone.id === myZone.id ? "/" : `/?zone=${zone.id}`);

  return (
    <div className="w-full space-y-1 text-sm">
      {viewing ? (
        <div className="space-y-2 rounded-lg border-2 border-primary p-3">
          <p lang={lang}>{t(VIEWING, lang).replace("{name}", shownZone.name).replace("{mine}", myZone.name)}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/" lang={lang}>
                {t(BACK, lang)}
              </Link>
            </Button>
            {whereYouAre && whereYouAre.id !== shownZone.id && (
              <Button asChild size="sm" variant="outline">
                <Link href={hrefFor(whereYouAre)} lang={lang}>
                  {t(MY_LOCATION, lang)}
                </Link>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium">{myZone.name}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setChanging(true)}>
              <span lang={lang}>{t(CHANGE, lang)}</span>
            </Button>
          </div>
          {whereYouAre && whereYouAre.id !== myZone.id && (
            <p className="text-muted-foreground">
              <span lang={lang}>{t(YOURE_IN, lang).replace("{name}", whereYouAre.name)}</span>{" "}
              <Link href={hrefFor(whereYouAre)} lang={lang} className="font-medium text-foreground underline underline-offset-2">
                {t(VIEW, lang)}
              </Link>
            </p>
          )}
        </>
      )}
      {changing && <ChangeBarangayDialog onClose={() => setChanging(false)} />}
    </div>
  );
}
