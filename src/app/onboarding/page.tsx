"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConsentNotice } from "@/features/onboarding/consent-notice";
import { ZonePicker } from "@/features/onboarding/zone-picker";
import { InstallStep } from "@/features/onboarding/install-step";
import {
  markOnboarded,
  setSelectedZoneId,
} from "@/features/onboarding/onboarding-storage";
import { MOCK_ZONES } from "@/lib/mock-data";

type Step = "consent" | "zone" | "install";

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("consent");
  const router = useRouter();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-4 sm:p-6 lg:p-8">
      {step === "consent" && <ConsentNotice onAccept={() => setStep("zone")} />}

      {step === "zone" && (
        <ZonePicker
          zones={MOCK_ZONES}
          onSelect={(zoneId) => {
            // The picked zone is what every other screen resolves against —
            // store it before moving on. Onboarding is only marked complete at
            // the end, so a resident who closes the tab mid-flow starts again
            // rather than landing on a home screen with no zone chosen.
            setSelectedZoneId(zoneId);
            setStep("install");
          }}
        />
      )}

      {step === "install" && (
        <InstallStep
          onContinue={() => {
            markOnboarded();
            router.replace("/");
          }}
        />
      )}
    </main>
  );
}
