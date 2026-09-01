"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasOnboarded } from "./onboarding-storage";

/** Renders nothing; sends first-time visitors to consent + zone onboarding. */
export function OnboardingGate() {
  const router = useRouter();

  useEffect(() => {
    if (!hasOnboarded()) {
      router.replace("/onboarding");
    }
  }, [router]);

  return null;
}
