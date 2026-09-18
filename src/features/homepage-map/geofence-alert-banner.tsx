"use client";

import { AlertTriangle, X } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const GEOFENCE_TITLE: LocalizedText = {
  en: "You are near a dangerous area",
  fil: "Malapit ka sa mapanganib na lugar",
};

const DISMISS: LocalizedText = { en: "Dismiss", fil: "Isara" };

interface GeofenceAlertBannerProps {
  zoneName: string;
  severity: string;
  message: string;
  onDismiss: () => void;
}

export function GeofenceAlertBanner({
  zoneName,
  severity,
  message,
  onDismiss,
}: GeofenceAlertBannerProps) {
  const { lang } = useLanguage();

  const bgColor =
    severity === "hazardous"
      ? "bg-severity-evacuate/90 border-severity-evacuate"
      : "bg-severity-red/90 border-severity-red";

  return (
    <div
      role="alert"
      className={`fixed top-0 left-0 right-0 z-[9999] border-b-2 ${bgColor} px-4 py-3 shadow-lg backdrop-blur-sm`}
    >
      <div className="mx-auto flex max-w-2xl items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-white" />
        <div className="flex-1">
          <p className="text-sm font-bold text-white">
            {t(GEOFENCE_TITLE, lang)}
          </p>
          <p className="mt-0.5 text-sm text-white/90">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-white/70 hover:text-white"
          aria-label={t(DISMISS, lang)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
