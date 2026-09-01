"use client";

import { useState } from "react";
import { ReportForm } from "@/features/water-level-report/report-form";
import { DEPTH_LABEL, type DepthLevel } from "@/lib/depth";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function ReportPage() {
  const [submitted, setSubmitted] = useState<DepthLevel | null>(null);
  const zone = MOCK_ZONES[0];

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <h1 className="text-lg font-semibold">Report water level — {zone.name}</h1>
      {submitted ? (
        <p role="status" className="text-base">
          Thanks — your &ldquo;{DEPTH_LABEL[submitted]}&rdquo; report was recorded.
          (Mock only in Phase 1.)
        </p>
      ) : (
        <ReportForm zoneId={zone.id} onSubmit={setSubmitted} />
      )}
    </main>
  );
}
