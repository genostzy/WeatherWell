"use client";

import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { SEVERITY_LABEL, SEVERITY_BADGE_CLASS, type Severity } from "@/lib/severity";

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { lang } = useLanguage();

  return (
    <Badge lang={lang} className={SEVERITY_BADGE_CLASS[severity]}>
      {t(SEVERITY_LABEL[severity], lang)}
    </Badge>
  );
}
