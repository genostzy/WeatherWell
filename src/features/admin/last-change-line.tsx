"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/features/i18n/language-provider";
import { describeAction } from "@/lib/official-actions-copy";
import type { OfficialAction } from "@/lib/official-actions-mapper";
import type { LanguageCode } from "@/lib/types";

const LOCALE: Record<LanguageCode, string> = { en: "en-PH", fil: "fil-PH" };

/**
 * The latest alert change for one zone, beside the alert status on the
 * Manage zone page: "Lowered to Advisory by Juan Dela Cruz, 2:14 AM". Renders
 * nothing while loading, when there is no entry yet, and when the fetch
 * fails — this is a supplementary line, not a gate, so a network hiccup here
 * must never block or error the page around it.
 */
export function LastChangeLine({ zoneId }: { zoneId: string }) {
  const { lang } = useLanguage();
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
  }, [zoneId]);

  if (!entry) return null;

  const time = new Date(entry.occurredAt).toLocaleTimeString(LOCALE[lang]);

  return (
    <p className="text-xs text-muted-foreground">
      {describeAction(entry, lang)} by {entry.actorName}, {time}
    </p>
  );
}
