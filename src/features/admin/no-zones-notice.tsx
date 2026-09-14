import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import type { LanguageCode, LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "No barangays in your area", fil: "Walang barangay sa iyong sakop" };
const BODY: LocalizedText = {
  en: "Your appointed area code does not match any barangay in the system. Contact the system owner to fix your appointment.",
  fil: "Ang itinalagang area code mo ay walang katugmang barangay sa sistema. Makipag-ugnayan sa may-ari ng sistema para maayos ang appointment mo.",
};

/**
 * `appoint_official`'s raw-digit escape hatch deliberately accepts a PSGC
 * code that covers no barangays (it reports "covers 0 barangay(s): none" and
 * the appointment stands) — genuinely reachable in production, not just a
 * test fixture. Every screen whose zone list is now area-filtered must show
 * this instead of crashing on an empty zones array.
 */
export function NoZonesNotice({ lang }: { lang: LanguageCode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center sm:p-6 lg:p-8">
      <Card className="max-w-md">
        <CardContent className="space-y-2 pt-6">
          <p className="font-medium">{t(TITLE, lang)}</p>
          <p className="text-sm text-muted-foreground">{t(BODY, lang)}</p>
        </CardContent>
      </Card>
    </main>
  );
}
