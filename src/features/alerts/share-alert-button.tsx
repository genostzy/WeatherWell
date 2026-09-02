"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { AlertRecord, LocalizedText, Zone } from "@/lib/types";

const SHARE_ALERT: LocalizedText = { en: "Share Alert", fil: "Ibahagi" };

export function ShareAlertButton({
  alert,
  zone,
}: {
  alert: AlertRecord;
  zone: Zone;
}) {
  const { lang } = useLanguage();
  const shareLabel = t(SHARE_ALERT, lang);

  const shareText = `⚠️ ${alert.severity.toUpperCase()} — ${zone.name}\n${t(alert.message, lang)}\n📍 ${zone.evacuationCenterName}`;

  const handleShare = async () => {
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

  return (
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
  );
}
