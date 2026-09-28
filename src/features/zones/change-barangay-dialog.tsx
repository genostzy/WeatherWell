"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OverlayDialog } from "@/components/overlay-dialog";
import { useLanguage } from "@/features/i18n/language-provider";
import { ZonePicker } from "@/features/onboarding/zone-picker";
import { setSelectedZoneId } from "@/features/onboarding/onboarding-storage";
import { followEmailAlerts } from "@/lib/follow-email-alerts";
import { followPushSubscription } from "@/lib/push-subscription";
import { t } from "@/lib/i18n";
import { useZones } from "@/lib/reference-data/use-reference-data";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Change my barangay", fil: "Palitan ang aking barangay" };
const MAKE_MINE: LocalizedText = { en: "Make this my barangay", fil: "Gawin itong aking barangay" };
const SAVED: LocalizedText = { en: "Alerts now come for {name}.", fil: "Para sa {name} na ngayon ang mga alerto." };
const NOT_SAVED: LocalizedText = {
  en: "Couldn't save this on this phone. If it is in private browsing, turn that off and try again.",
  fil: "Hindi ito maitabi sa teleponong ito. Kung naka-private browsing, patayin ito at subukan muli.",
};
const DONE: LocalizedText = { en: "Done", fil: "Tapos na" };
const CLOSE: LocalizedText = { en: "Close", fil: "Isara" };

/**
 * Changes my barangay: the one push and email alerts come for, and the one
 * every screen shows by default. The setup picker, in a dialog. Push and
 * email alerts are moved here, wherever the change is made.
 */
export function ChangeBarangayDialog({ onClose }: { onClose: () => void }) {
  const { lang } = useLanguage();
  const zones = useZones();
  const [result, setResult] = useState<{ saved: true; name: string } | { saved: false } | null>(null);

  function choose(zoneId: string) {
    if (!setSelectedZoneId(zoneId)) {
      setResult({ saved: false });
      return;
    }
    void followEmailAlerts(zoneId);
    void followPushSubscription(zoneId);
    setResult({ saved: true, name: zones.find((zone) => zone.id === zoneId)?.name ?? zoneId });
  }

  return (
    <OverlayDialog onClose={onClose} label={t(TITLE, lang)} closeLabel={t(CLOSE, lang)}>
      <div className="space-y-4 rounded-xl border-2 border-border bg-background p-4">
        <h2 lang={lang} className="text-base font-semibold">
          {t(TITLE, lang)}
        </h2>
        {result?.saved ? (
          <>
            <p role="status" lang={lang} className="text-sm">
              {t(SAVED, lang).replace("{name}", result.name)}
            </p>
            {/* The confirm button is gone; focus goes here, not to the page behind the dialog. */}
            <Button type="button" className="w-full" onClick={onClose} autoFocus>
              {t(DONE, lang)}
            </Button>
          </>
        ) : (
          <>
            {result && (
              <p role="alert" lang={lang} className="text-sm text-severity-red">
                {t(NOT_SAVED, lang)}
              </p>
            )}
            <ZonePicker onSelect={choose} confirmLabel={MAKE_MINE} />
          </>
        )}
      </div>
    </OverlayDialog>
  );
}
