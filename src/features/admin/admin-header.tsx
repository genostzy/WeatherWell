"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, History, Home, LayoutDashboard, Map, PlayCircle, ShieldCheck, Smartphone, Users, type LucideIcon } from "lucide-react";
import { useOfficial } from "@/lib/auth/official-context";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Official } from "@/lib/auth/official";
import type { LocalizedText } from "@/lib/types";

const SIGN_OUT: LocalizedText = { en: "Sign out", fil: "Mag-sign out" };
const ALL_AREAS: LocalizedText = { en: "All areas", fil: "Lahat ng lugar" };

type Level = Official["level"];

/**
 * Who the signed-in account is, said plainly: the three levels see different
 * things, and until this badge they all looked like the same "admin" page.
 * Icon and words carry it, colour only reinforces.
 */
const ROLE: Record<Level, { label: LocalizedText; icon: LucideIcon; tone: string }> = {
  admin: {
    label: { en: "System admin", fil: "System admin" },
    icon: ShieldCheck,
    tone: "border-violet-500/50 bg-violet-500/15 text-violet-200",
  },
  municipality: {
    label: { en: "Municipal official", fil: "Opisyal ng munisipyo" },
    icon: Building2,
    tone: "border-sky-500/50 bg-sky-500/15 text-sky-200",
  },
  barangay: {
    label: { en: "Barangay official", fil: "Opisyal ng barangay" },
    icon: Home,
    tone: "border-teal-500/50 bg-teal-500/15 text-teal-200",
  },
};

interface NavItem {
  href: string;
  label: LocalizedText;
  icon: LucideIcon;
}

const HISTORY: NavItem = { href: "/admin/history", label: { en: "History", fil: "Kasaysayan" }, icon: History };
const MAP: NavItem = { href: "/admin/map", label: { en: "Operations map", fil: "Mapa ng operasyon" }, icon: Map };
const RESIDENT_VIEW: NavItem = { href: "/", label: { en: "Resident view", fil: "Tingin ng residente" }, icon: Smartphone };

function navFor(official: Official): NavItem[] {
  switch (official.level) {
    case "admin":
      return [
        { href: "/admin", label: { en: "System dashboard", fil: "Dashboard ng sistema" }, icon: LayoutDashboard },
        MAP,
        { href: "/admin/officials", label: { en: "Officials", fil: "Mga Opisyal" }, icon: Users },
        HISTORY,
        { href: "/admin/simulation", label: { en: "Drill", fil: "Pagsasanay" }, icon: PlayCircle },
        RESIDENT_VIEW,
      ];
    case "municipality":
      return [
        {
          href: "/admin",
          label: { en: `${official.areaName} dashboard`, fil: `Dashboard ng ${official.areaName}` },
          icon: LayoutDashboard,
        },
        MAP,
        { href: "/admin/officials", label: { en: "Barangay officials", fil: "Mga opisyal ng barangay" }, icon: Users },
        HISTORY,
        RESIDENT_VIEW,
      ];
    case "barangay":
      return [
        { href: "/admin", label: { en: "My barangay", fil: "Aking barangay" }, icon: Home },
        HISTORY,
        RESIDENT_VIEW,
      ];
  }
}

/** A barangay official's /admin is their barangay's page, so that counts as "My barangay" too. */
function isCurrent(href: string, pathname: string | null, level: Level): boolean {
  if (!pathname) return false;
  if (href === "/admin") return pathname === "/admin" || (level === "barangay" && pathname.startsWith("/admin/zone/"));
  if (href === "/") return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sits atop every /admin page, mounted once by the layout's OfficialProvider.
 * The sign-out control is a real form POST (not a client-side call) so it
 * works with JS disabled and matches /auth/signout's POST-only guard.
 */
export function AdminHeader() {
  const official = useOfficial();
  const { lang } = useLanguage();
  const pathname = usePathname();
  const role = ROLE[official.level];
  const RoleIcon = role.icon;

  return (
    <header className="border-b">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            lang={lang}
            className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", role.tone)}
          >
            <RoleIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {t(role.label, lang)}
          </span>
          <span className="min-w-0 truncate font-medium">
            {official.displayName} — {official.level === "admin" ? t(ALL_AREAS, lang) : official.areaName}
          </span>
        </div>
        <form method="post" action="/auth/signout">
          <input type="hidden" name="next" value="/" />
          <Button type="submit" variant="outline" size="sm">
            {t(SIGN_OUT, lang)}
          </Button>
        </form>
      </div>
      <nav aria-label="Officials" className="flex gap-1 overflow-x-auto px-2 pb-2">
        {navFor(official).map((item) => {
          const current = isCurrent(item.href, pathname, official.level);
          const Icon = item.icon;
          return (
            <Button key={item.href} asChild variant={current ? "secondary" : "ghost"} className="h-10 shrink-0">
              <Link href={item.href} aria-current={current ? "page" : undefined}>
                <Icon aria-hidden="true" />
                <span lang={lang}>{t(item.label, lang)}</span>
              </Link>
            </Button>
          );
        })}
      </nav>
    </header>
  );
}
