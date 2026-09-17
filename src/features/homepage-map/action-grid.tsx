"use client";

import Link from "next/link";
import { Building2, Droplet, Map, Settings } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const ACTIONS: {
  href: string;
  label: LocalizedText;
  icon: typeof Building2;
  accent?: boolean;
}[] = [
  {
    href: "/report",
    label: { en: "Report", fil: "Ulat" },
    icon: Droplet,
    accent: true,
  },
  {
    href: "/evacuation",
    label: { en: "Evacuation", fil: "Evacuation" },
    icon: Building2,
  },
  {
    href: "/map",
    label: { en: "Zones", fil: "Zones" },
    icon: Map,
  },
  {
    href: "/admin",
    label: { en: "Admin", fil: "Admin" },
    icon: Settings,
  },
];

/**
 * 2x2 grid of quick-action buttons. Each is a large, touch-friendly card
 * with an icon and label. The Report button uses a subtle accent to draw
 * attention to the primary crowd-sourcing action.
 */
export function ActionGrid() {
  const { lang } = useLanguage();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
      {ACTIONS.map(({ href, label, icon: Icon, accent }) => (
        <Link
          key={href}
          href={href}
          className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition-colors hover:bg-muted/50 sm:flex-row sm:gap-3 sm:p-4 ${
            accent
              ? "border-severity-orange/30 bg-severity-orange/5 text-severity-orange hover:bg-severity-orange/10"
              : "border-border"
          }`}
        >
          <Icon aria-hidden="true" className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
          <span className="text-sm font-medium">{t(label, lang)}</span>
        </Link>
      ))}
    </div>
  );
}
