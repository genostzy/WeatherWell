"use client";

import { ArrowDownCircle } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { SEVERITY_LABEL } from "@/lib/severity";
import type { AlertDowngradeNotice as Notice } from "@/lib/zone-overrides";

/**
 * PRD Anti-Abuse layer 9, "Transparent downgrade": when an operator lowers or
 * withdraws an alert, residents are told, rather than watching it disappear.
 *
 * The layer earns its place next to the other nine because a warning system
 * that can quietly retract a warning is a warning system residents learn not
 * to trust. Someone who saw "Evacuate Now" and then sees nothing has no way to
 * tell an all-clear from a bug, and the safe reading of that ambiguity — assume
 * it is still dangerous — is the one that keeps people in a flooding house.
 *
 * The wording deliberately does not supply a reason. The prototype captures no
 * reason from the operator, and inventing a plausible one ("water levels below
 * threshold") would be the system asserting something nobody told it. Naming
 * the change and its author is the honest floor.
 */
export function AlertDowngradeNotice({ notice }: { notice: Notice }) {
  const { lang } = useLanguage();

  const from = t(SEVERITY_LABEL[notice.from], lang);
  const text =
    notice.to === "none"
      ? {
          en: `Alert lifted — zone management withdrew the earlier ${from}.`,
          fil: `Inalis ang alerto — binawi ng namamahala sa zone ang naunang ${from}.`,
        }
      : {
          en: `Alert downgraded — ${from} lowered to ${t(SEVERITY_LABEL[notice.to], lang)} by zone management.`,
          fil: `Ibinaba ang alerto — mula ${from} tungo sa ${t(SEVERITY_LABEL[notice.to], lang)}, ayon sa namamahala sa zone.`,
        };

  return (
    <p
      // Polite rather than assertive: this is a de-escalation, and it must not
      // interrupt a screen-reader user mid-sentence on the alert above it.
      role="status"
      lang={lang}
      className="flex w-full max-w-2xl items-center gap-2 rounded-md border-2 border-border p-3 text-sm lg:max-w-5xl"
    >
      <ArrowDownCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
      {t(text, lang)}
    </p>
  );
}
