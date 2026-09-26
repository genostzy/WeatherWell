"use client";

import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const WHERE_YOU_ARE: LocalizedText = {
  en: "Reporting for {name} (where you are)",
  fil: "Iuulat para sa {name} (kung nasaan ka)",
};
const YOUR_BARANGAY: LocalizedText = {
  en: "Reporting for {name} (your barangay)",
  fil: "Iuulat para sa {name} (iyong barangay)",
};

/** Which barangay a report counts for, said before the tap. */
export function ReportingFor({ zoneName, whereYouAre }: { zoneName: string; whereYouAre: boolean }) {
  const { lang } = useLanguage();
  return (
    <p lang={lang} className="text-xs text-muted-foreground">
      {t(whereYouAre ? WHERE_YOU_ARE : YOUR_BARANGAY, lang).replace("{name}", zoneName)}
    </p>
  );
}
