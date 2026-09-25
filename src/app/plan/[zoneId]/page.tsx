"use client";

import { use } from "react";
import { FloodPlan } from "@/features/evacuation/flood-plan";

/** A barangay's printable flood plan. Public: residents print it as well as officials. */
export default function FloodPlanPage({ params }: PageProps<"/plan/[zoneId]">) {
  const { zoneId } = use(params);
  return (
    <main className="flex flex-1 flex-col p-4 sm:p-6 print:p-0">
      <FloodPlan zoneId={zoneId} />
    </main>
  );
}
