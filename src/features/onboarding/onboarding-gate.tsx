"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { hasOnboarded } from "./onboarding-storage";

/**
 * localStorage is only written by the onboarding flow, which navigates away
 * from any page mounting this gate, so there is nothing to subscribe to — the
 * snapshot is read once per mount.
 */
function subscribe(): () => void {
  return () => {};
}

/** Server render can't see localStorage: "not yet known", which shows the skeleton. */
function getServerSnapshot(): boolean | null {
  return null;
}

/**
 * Renders a full-screen skeleton while the onboarding status is unknown, then
 * either redirects (first-time visitor) or renders nothing further
 * (already-onboarded — the real page content takes over). This replaces
 * an earlier version that returned null outright, which let a first-time
 * visitor's browser paint the real home screen for one frame before the
 * redirect fired.
 *
 * The status is read through useSyncExternalStore rather than an effect +
 * setState: localStorage is an external store, and reading it this way keeps
 * the effect free of the cascading-render setState the React compiler's
 * `set-state-in-effect` rule (correctly) rejects.
 */
export function OnboardingGate() {
  const router = useRouter();
  const onboarded = useSyncExternalStore<boolean | null>(
    subscribe,
    hasOnboarded,
    getServerSnapshot
  );

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
