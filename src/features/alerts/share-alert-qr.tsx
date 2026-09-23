"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { alertUrl, type SharedAlert } from "@/lib/alert-share/payload";
import type { LocalizedText } from "@/lib/types";

const SHOW_CODE: LocalizedText = { en: "Show QR code", fil: "Ipakita ang QR code" };
const HIDE_CODE: LocalizedText = { en: "Hide QR code", fil: "Itago ang QR code" };
const SCAN_INSTRUCTION: LocalizedText = {
  en: "Point the other phone's camera at this. No internet needed on either phone.",
  fil: "Itutok ang camera ng kabilang telepono dito. Walang kailangang internet sa kahit alin.",
};
const CODE_ALT: LocalizedText = { en: "QR code containing this alert", fil: "QR code na naglalaman ng alertong ito" };
const GENERATION_FAILED: LocalizedText = {
  en: "Alert too long for a QR code — send the link instead.",
  fil: "Masyadong mahaba ang alerto para sa QR code — ipadala na lang ang link.",
};

/**
 * Renders the alert as a QR code so it can cross to another phone with no
 * network on either side.
 *
 * Nothing here scans: every modern Android and iOS camera app reads a QR and
 * offers to open the URL it contains, so the recipient needs no app, no
 * permission prompt, and no instructions beyond "point your camera at this".
 * Writing a scanner would add a camera permission and a decoding library to
 * duplicate something the phone already does better.
 */
export function ShareAlertQr({ alert }: { alert: SharedAlert }) {
  const { lang } = useLanguage();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    if (dataUrl) {
      setDataUrl(null);
      return;
    }
    setFailed(false);
    const url = alertUrl(window.location.origin, alert);
    try {
      // Medium correction: a phone screen in rain, held by someone else, is a
      // worse scanning surface than paper.
      setDataUrl(await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 320 }));
    } catch {
      // toDataURL rejects when the payload exceeds QR capacity (~1.6KB at
      // this error-correction level) — a long bilingual alert message
      // crosses that ceiling before it looks long. Silence here would be a
      // button that visibly does nothing when pressed.
      setFailed(true);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="lg" onClick={() => void toggle()}>
        <QrCode aria-hidden="true" className="h-4 w-4" />
        {t(dataUrl ? HIDE_CODE : SHOW_CODE, lang)}
      </Button>

      {failed && (
        <p lang={lang} role="alert" className="text-sm text-severity-red">
          {t(GENERATION_FAILED, lang)}
        </p>
      )}

      {dataUrl && (
        <div className="space-y-2 rounded-md border-2 border-border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated
              data: URL, not an asset next/image can optimise */}
          <img src={dataUrl} alt={t(CODE_ALT, lang)} className="mx-auto h-auto w-full max-w-64" />
          <p lang={lang} className="text-center text-xs text-black">
            {t(SCAN_INSTRUCTION, lang)}
          </p>
        </div>
      )}
    </div>
  );
}
