"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConsentNotice } from "@/features/onboarding/consent-notice";
import { ZonePicker } from "@/features/onboarding/zone-picker";
import {
  markOnboarded,
  setSelectedZoneId,
} from "@/features/onboarding/onboarding-storage";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function OnboardingPage() {
  const [consented, setConsented] = useState(false);
  const router = useRouter();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-4 sm:p-6 lg:p-8">
      {!consented ? (
        <ConsentNotice onAccept={() => setConsented(true)} />
      ) : (
        <ZonePicker
          zones={MOCK_ZONES}
          onSelect={(zoneId) => {
            // The picked zone is what every other screen resolves against —
            // store it before marking onboarding complete.
            setSelectedZoneId(zoneId);
            markOnboarded();
            router.replace("/");
          }}
        />
      )}
    </main>
  );
}
