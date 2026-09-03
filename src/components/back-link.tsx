import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const BACK_TO_ALERTS: LocalizedText = { en: "Back to alerts", fil: "Bumabalik sa mga alerto" };

/**
 * Every screen other than the home alert screen needs a visible way back to
 * it — the app is a PWA, so there is no browser chrome to rely on.
 */
export function BackLink({ className = "max-w-md" }: { className?: string }) {
  const { lang } = useLanguage();
  return (
    <div className={`w-full ${className}`}>
      <Button asChild variant="ghost" size="lg">
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          {t(BACK_TO_ALERTS, lang)}
        </Link>
      </Button>
    </div>
  );
}
