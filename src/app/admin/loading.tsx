"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const LOADING: LocalizedText = { en: "Loading your dashboard…", fil: "Kinukuha ang iyong dashboard…" };

/**
 * Shown under the header while any officials' page loads on the server
 * (the dashboard, a barangay, History, Officials): its rough shape, so a
 * slow connection reads as "coming" rather than "broken".
 */
export default function Loading() {
  const { lang } = useLanguage();
  return (
    <main className="flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div role="status" aria-label={t(LOADING, lang)} className="w-full max-w-2xl space-y-6 lg:max-w-5xl">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <p lang={lang} className="text-center text-sm text-muted-foreground">
          {t(LOADING, lang)}
        </p>
      </div>
    </main>
  );
}
