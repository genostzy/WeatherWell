"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, MapPinCheck, Layers, UserCheck, Gavel } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "What happens with your report", fil: "Ano ang mangyayari sa ulat mo" };
const PHASE_NOTE: LocalizedText = {
  en: "Phase 1 records reports on this device only. The checks above are how the real pipeline will treat them from Phase 3.",
  fil: "Sa Phase 1, dito lang sa device naitatala ang ulat. Ganito sila susuriin ng totoong pipeline mula Phase 3.",
};

const STEPS: { icon: typeof ShieldCheck; title: LocalizedText; body: LocalizedText }[] = [
  {
    icon: MapPinCheck,
    title: { en: "Location check", fil: "Pagsusuri ng lokasyon" },
    body: {
      en: "Your GPS must fall inside the zone you're reporting for, with a generous tolerance near the edges.",
      fil: "Dapat nasa loob ng zone ang iyong GPS, may maluwag na tolerance sa gilid.",
    },
  },
  {
    icon: Layers,
    title: { en: "Several reports, not one", fil: "Ilang ulat, hindi iisa" },
    body: {
      en: "No single report raises an alert. Several independent, agreeing reports are needed first.",
      fil: "Walang iisang ulat ang magpapataas ng alerto. Kailangan ng ilang magkakatugmang ulat.",
    },
  },
  {
    icon: UserCheck,
    title: { en: "Odd readings count less", fil: "Mas mababa ang timbang ng kakaibang ulat" },
    body: {
      en: "A report that disagrees sharply with nearby ones is downweighted, not deleted.",
      fil: "Ang ulat na malayo sa mga katabi ay binabaan ang timbang, hindi binubura.",
    },
  },
  {
    icon: Gavel,
    title: { en: "A person has the last word", fil: "May huling salita ang tao" },
    body: {
      en: "Auto-triggered alerts are a fast first response. An admin can confirm, downgrade, or cancel — and a downgrade is always shown, never hidden.",
      fil: "Mabilis na unang tugon lang ang auto-alert. Maaaring kumpirmahin, ibaba, o kanselahin ng admin — at laging ipinapakita ang pagbaba.",
    },
  },
];

/** Makes the anti-abuse pipeline legible to the person submitting — a resident who knows one report won't panic the barangay is likelier to send an honest one. */
export function ReportExplainer() {
  const { lang } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-3">
          {STEPS.map((step) => (
            <li key={step.title.en} className="flex gap-3">
              <step.icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{t(step.title, lang)}</p>
                <p lang={lang} className="text-xs text-muted-foreground">
                  {t(step.body, lang)}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p lang={lang} className="border-t pt-3 text-xs text-muted-foreground">
          {t(PHASE_NOTE, lang)}
        </p>
      </CardContent>
    </Card>
  );
}
