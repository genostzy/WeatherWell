"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { SEVERITY_LABEL } from "@/lib/severity";
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

  // The severity has to be the label a person reads elsewhere in the app, and
  // localised like the rest of the message. The raw enum put "YELLOW" and
  // "EVACUATE" into the one text that leaves the app and reaches neighbours
  // who may never have seen WeatherWell — an internal token that says nothing
  // actionable, and that reads like a PAGASA colour code without being one.
  const shareText = `⚠️ ${t(SEVERITY_LABEL[alert.severity], lang)} — ${zone.name}\n${t(alert.message, lang)}\n📍 ${zone.evacuationCenterName}`;

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
