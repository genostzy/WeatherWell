"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";
import { NAV_ACTIVE } from "@/components/nav-active";

const OVERVIEW: LocalizedText = { en: "Overview", fil: "Buod" };
const REPORTS: LocalizedText = { en: "Reports", fil: "Mga Ulat" };
const CHECK_INS: LocalizedText = { en: "Check-ins", fil: "Mga Check-in" };
const PINS: LocalizedText = { en: "Pins", fil: "Mga Pin" };
const SETTINGS: LocalizedText = { en: "Settings", fil: "Mga Setting" };

const TABS: { href: string; label: LocalizedText }[] = [
  { href: "/resident", label: OVERVIEW },
  { href: "/resident/reports", label: REPORTS },
  { href: "/resident/check-ins", label: CHECK_INS },
  { href: "/resident/pins", label: PINS },
  { href: "/resident/settings", label: SETTINGS },
];

/**
 * Mounted once by the /resident layout, same split as /admin's AdminHeader:
 * the layout itself stays a server component (it does the auth redirect),
 * and this client component reads the live language selection to localize
 * the tab labels.
 */
export function ResidentNav() {
  const { lang } = useLanguage();
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border pb-2">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
              active ? NAV_ACTIVE : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t(tab.label, lang)}
          </Link>
        );
      })}
    </nav>
  );
}
