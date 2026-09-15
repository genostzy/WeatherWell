"use client";

import { useContext, useEffect, useState } from "react";
import { useLanguage } from "@/features/i18n/language-provider";
import { AlertsContext } from "@/lib/alerts-store";
import { describeLastChange } from "@/lib/official-actions-copy";
import type { OfficialAction } from "@/lib/official-actions-mapper";

/**
 * The latest alert change for one zone, beside the alert status on the
 * Manage zone page: "Lowered to Advisory by Juan Dela Cruz, 2:14 AM". Renders
 * nothing while loading, when there is no entry yet, and when the fetch
 * fails — this is a supplementary line, not a gate, so a network hiccup here
 * must never block or error the page around it.
 *
 * Refetches whenever the alert list changes (C1). The alerts store replaces
 * that list after every confirmed alert write, so this line follows the
 * write just made instead of naming the change before it. Read with
 * useContext rather than useAlerts so the line still renders, fetching once,
 * where no alert list is mounted.
 */
export function LastChangeLine({ zoneId }: { zoneId: string }) {
  const { lang } = useLanguage();
  const alerts = useContext(AlertsContext);
  const [entry, setEntry] = useState<OfficialAction | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/official-actions?zone=${encodeURIComponent(zoneId)}&kind=alert&limit=1`)
      .then((response) => (response.ok ? (response.json() as Promise<OfficialAction[]>) : Promise.reject()))
      .then((entries) => {
        if (!cancelled) setEntry(entries[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setEntry(null);
      });

    return () => {
      cancelled = true;
    };
  }, [zoneId, alerts]);

  if (!entry) return null;

  return <p className="text-xs text-muted-foreground">{describeLastChange(entry, lang)}</p>;
}
