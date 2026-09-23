"use client";

import Link from "next/link";
import { useOfficial } from "@/lib/auth/official-context";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { LocalizedText } from "@/lib/types";

const SIGN_OUT: LocalizedText = { en: "Sign out", fil: "Mag-sign out" };
const HISTORY: LocalizedText = { en: "History", fil: "Kasaysayan" };
const OFFICIALS: LocalizedText = { en: "Officials", fil: "Mga Opisyal" };
const ALL_AREAS: LocalizedText = { en: "All areas", fil: "Lahat ng lugar" };

/**
 * Sits atop every /admin page, mounted once by the layout's OfficialProvider.
 * The sign-out control is a real form POST (not a client-side call) so it
 * works with JS disabled and matches /auth/signout's POST-only guard.
 */
export function AdminHeader() {
  const official = useOfficial();
  const { lang } = useLanguage();

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
      <span className="min-w-0 truncate font-medium">
        {official.displayName} — {official.level === "admin" ? t(ALL_AREAS, lang) : official.areaName}
      </span>
      <div className="flex items-center gap-2">
        {official.level === "admin" && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/officials">{t(OFFICIALS, lang)}</Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/history">{t(HISTORY, lang)}</Link>
        </Button>
        <form method="post" action="/auth/signout">
          <input type="hidden" name="next" value="/" />
          <Button type="submit" variant="outline" size="sm">
            {t(SIGN_OUT, lang)}
          </Button>
        </form>
      </div>
    </header>
  );
}
