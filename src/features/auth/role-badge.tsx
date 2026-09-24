"use client";

import { Building2, Home, ShieldCheck, User, UserRound, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { LocalizedText } from "@/lib/types";

export type AccountKind = "guest" | "resident" | "barangay" | "municipality" | "admin";

const KIND: Record<AccountKind, { label: LocalizedText; icon: LucideIcon; tone: string }> = {
  guest: {
    label: { en: "Guest", fil: "Bisita" },
    icon: UserRound,
    tone: "border-border bg-muted/40 text-muted-foreground",
  },
  resident: {
    label: { en: "Resident", fil: "Residente" },
    icon: User,
    tone: "border-green-500/50 bg-green-500/15 text-green-200",
  },
  barangay: {
    label: { en: "Barangay official", fil: "Opisyal ng barangay" },
    icon: Home,
    tone: "border-teal-500/50 bg-teal-500/15 text-teal-200",
  },
  municipality: {
    label: { en: "Municipal official", fil: "Opisyal ng munisipyo" },
    icon: Building2,
    tone: "border-sky-500/50 bg-sky-500/15 text-sky-200",
  },
  admin: {
    label: { en: "System admin", fil: "System admin" },
    icon: ShieldCheck,
    tone: "border-violet-500/50 bg-violet-500/15 text-violet-200",
  },
};

/**
 * Which account this device is using, on every screen: Guest, Resident, or
 * the official's level. Icon and words carry it; colour only reinforces.
 * `detail` is read out after the label but not shown ("saved on this device").
 */
export function RoleBadge({ kind, detail, className }: { kind: AccountKind; detail?: string; className?: string }) {
  const { lang } = useLanguage();
  const { label, icon: Icon, tone } = KIND[kind];
  return (
    <span
      lang={lang}
      className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", tone, className)}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {t(label, lang)}
      {detail && <span className="sr-only"> — {detail}</span>}
    </span>
  );
}
