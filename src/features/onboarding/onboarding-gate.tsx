"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasOnboarded } from "./onboarding-storage";

/**
 * Renders a full-screen skeleton while the onboarding status is unknown, then
 * either redirects (first-time visitor) or renders nothing further
 * (already-onboarded — the real page content takes over). This replaces
 * an earlier version that returned null outright, which let a first-time
 * visitor's browser paint the real home screen for one frame before the
 * redirect fired.
 *
 * The status is read through useHasOnboarded (useSyncExternalStore under the
 * hood) rather than an effect + setState: localStorage is an external store,
 * and reading it this way keeps the effect free of the cascading-render
 * setState the React compiler's `set-state-in-effect` rule (correctly)
 * rejects. ReferenceDataProvider reads the same hook, for the same reason —
 * see its own doc comment.
 */
export function OnboardingGate() {
  const router = useRouter();
  const onboarded = useHasOnboarded();

  useEffect(() => {
    if (onboarded === false) router.replace("/onboarding");
  }, [onboarded, router]);

  if (onboarded === true) return null;

  return (
    <div
      data-testid="onboarding-gate-skeleton"
      aria-busy="true"
      aria-label={onboarded === false ? "Redirecting to setup" : "Loading"}
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
