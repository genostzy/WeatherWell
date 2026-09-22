"use client";

import { useState, useCallback } from "react";
import { Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { SEVERITY_LABEL } from "@/lib/severity";
import { generateAlertImage, downloadBlob } from "@/lib/share-image";
import { buildShareText, type SharedAlert } from "@/lib/alert-share/payload";
import { hasRealHotline, hasRealEvacuationCenter } from "@/lib/zone-data-quality";
import { ShareAlertQr } from "./share-alert-qr";
import type { AlertRecord, LocalizedText, Zone } from "@/lib/types";

const SHARE_ALERT: LocalizedText = { en: "Share Alert", fil: "Ibahagi" };
const DOWNLOAD_IMAGE: LocalizedText = { en: "Download Image", fil: "I-download ang Larawan" };
const GENERATING: LocalizedText = { en: "Generating...", fil: "Ginagawa..." };

export function ShareAlertButton({
  alert,
  zone,
}: {
  alert: AlertRecord;
  zone: Zone;
}) {
  const { lang } = useLanguage();
  const [generating, setGenerating] = useState(false);
  const shareLabel = t(SHARE_ALERT, lang);

  // severity carries the localized human label ("Evacuate Now" / "Lumikas
  // Na"), the same as message — both this text and the /a route that a
  // recipient's tap opens render it directly, and a raw enum ("evacuate")
  // means nothing to someone who has never seen the app.
  const shared: SharedAlert = {
    v: 1,
    zoneId: zone.id,
    zoneName: zone.name,
    severity: t(SEVERITY_LABEL[alert.severity], lang),
    severityKey: alert.severity,
    issuedAt: alert.issuedAt,
    message: t(alert.message, lang),
    // Task 1's predicates apply here too: a forwarded alert must not carry
    // a hotline that does not ring or a centre that does not exist.
    ...(hasRealEvacuationCenter(zone) ? { centerName: zone.evacuationCenterName } : {}),
    ...(hasRealHotline(zone) ? { hotline: zone.hotlineNumber } : {}),
  };

  const handleShare = async () => {
    // window.location.origin read here, not at render time: this component
    // renders once on the server during the initial page load (a "use
    // client" component still gets an SSR pass), where window does not
    // exist at all.
    const shareText = buildShareText(shared, window.location.origin, lang);

    if (navigator.share) {
      try {
        await navigator.share({
          title: `WeatherWell — ${zone.name}`,
          text: shareText,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      const smsUrl = `sms:?body=${encodeURIComponent(shareText)}`;
      window.location.href = smsUrl;
    }
  };

  const handleDownloadImage = useCallback(async () => {
    setGenerating(true);
    try {
      const blob = await generateAlertImage({
        severity: alert.severity,
        zoneName: zone.name,
        message: t(alert.message, lang),
        evacuationCenter: zone.evacuationCenterName,
        lang,
      });
      if (blob) {
        const filename = `weatherwell-${zone.name.toLowerCase().replace(/\s+/g, "-")}-${alert.severity}.png`;
        downloadBlob(blob, filename);
      }
    } finally {
      setGenerating(false);
    }
  }, [alert, zone, lang]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleShare}
          className="gap-2"
          aria-label={shareLabel}
        >
          <Share2 className="h-4 w-4" />
          {shareLabel}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadImage}
          disabled={generating}
          className="gap-2"
          aria-label={t(DOWNLOAD_IMAGE, lang)}
        >
          <Download className="h-4 w-4" />
          {generating ? t(GENERATING, lang) : t(DOWNLOAD_IMAGE, lang)}
        </Button>
      </div>
      <ShareAlertQr alert={shared} />
    </div>
  );
}
