"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { hasOnboarded } from "./onboarding-storage";

/**
 * Renders a full-screen skeleton while checking onboarding status, then
 * either redirects (first-time visitor) or renders nothing further
 * (already-onboarded — the real page content takes over). This replaces
 * an earlier version that returned null outright, which let a first-time
 * visitor's browser paint the real home screen for one frame before the
 * redirect fired.
 */
export function OnboardingGate() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!hasOnboarded()) {
      setRedirecting(true);
      router.replace("/onboarding");
      return;
    }
    setChecked(true);
  }, [router]);

  if (checked) return null;

  return (
    <div
      data-testid="onboarding-gate-skeleton"
      aria-busy="true"
      aria-label={redirecting ? "Redirecting to setup" : "Loading"}
      className="fixed inset-0 z-40 flex flex-col items-center gap-6 bg-background p-6 pt-16"
    >
      <Skeleton className="h-40 w-full max-w-md rounded-md" />
      <div className="flex w-full max-w-md flex-col gap-3">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    </div>
  );
}
