"use client";

import { useState } from "react";
import { BackLink } from "@/components/back-link";
import { ReportForm } from "@/features/water-level-report/report-form";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { DEPTH_LABEL, type DepthLevel } from "@/lib/depth";

export default function ReportPage() {
  const [submitted, setSubmitted] = useState<DepthLevel | null>(null);
  const zone = useSelectedZone();
  const { lang } = useLanguage();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <BackLink />
      <h1 className="text-lg font-semibold">Report water level — {zone.name}</h1>
      {submitted ? (
        <p role="status" className="text-base">
          Thanks — your &ldquo;{t(DEPTH_LABEL[submitted], lang)}&rdquo; report was
          recorded. (Mock only in Phase 1.)
        </p>
      ) : (
        <ReportForm zoneId={zone.id} onSubmit={setSubmitted} />
      )}
    </main>
  );
}
