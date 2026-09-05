"use client";

import { useState } from "react";
import { Download, Feather, Share, SignalZero, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useInstallMethod, promptInstall } from "@/lib/install-prompt";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = {
  en: "Put WeatherWell on your phone",
  fil: "Ilagay ang WeatherWell sa iyong telepono",
};

/**
 * The argument, not a slogan. Every other app asking to be installed is asking
 * for convenience; this one is asking because the moment it is needed is the
 * moment it can no longer be downloaded.
 */
const LEAD: LocalizedText = {
  en: "During a typhoon you may not be able to download anything. Installing now, while you still have signal, keeps your zone's alerts and evacuation instructions on the phone itself — where they stay readable after the network goes down.",
  fil: "Sa panahon ng bagyo, maaaring hindi ka na makapag-download ng kahit ano. Kapag na-install mo ito ngayon habang may signal ka pa, mananatili sa telepono mismo ang mga alerto at panuto sa paglikas para sa iyong zone — mababasa pa rin kahit mawalan ng koneksyon.",
};

const BENEFIT_OFFLINE: LocalizedText = {
  en: "Readable with no signal",
  fil: "Mababasa kahit walang signal",
};
const BENEFIT_OFFLINE_DETAIL: LocalizedText = {
  en: "Your alert, evacuation centre and route stay on the device.",
  fil: "Nasa device mismo ang alerto, evacuation centre at ruta mo.",
};
const BENEFIT_TAP: LocalizedText = {
  en: "One tap from your home screen",
  fil: "Isang tap mula sa home screen",
};
const BENEFIT_TAP_DETAIL: LocalizedText = {
  en: "No browser, no typing an address with wet hands.",
  fil: "Walang browser, walang ita-type na address gamit ang basang kamay.",
};
const BENEFIT_SIZE: LocalizedText = {
  en: "Smaller than one photo",
  fil: "Mas maliit pa sa isang larawan",
};
const BENEFIT_SIZE_DETAIL: LocalizedText = {
  en: "It costs almost nothing to keep installed.",
  fil: "Halos walang espasyong kailangan para manatili itong naka-install.",
};

const INSTALL_ACTION: LocalizedText = { en: "Install", fil: "I-install" };
const CONTINUE: LocalizedText = { en: "Continue", fil: "Magpatuloy" };
const SKIP: LocalizedText = { en: "Not now", fil: "Sa ibang pagkakataon" };

const IOS_HOW: LocalizedText = {
  en: "On iPhone, open the Share menu below and choose Add to Home Screen.",
  fil: "Sa iPhone, buksan ang Share menu sa ibaba at piliin ang Add to Home Screen.",
};
const BROWSER_HOW: LocalizedText = {
  en: "Open your browser's menu and choose Install app, or Add to Home Screen.",
  fil: "Buksan ang menu ng iyong browser at piliin ang Install app o Add to Home Screen.",
};
const INSTALLED_NOTE: LocalizedText = {
  en: "Already installed — you are set.",
  fil: "Naka-install na — handa ka na.",
};
const SKIP_NOTE: LocalizedText = {
  en: "You can install any time from your browser's menu. The app works either way — installing is what makes it work with no signal.",
  fil: "Maaari kang mag-install anumang oras mula sa menu ng browser. Gumagana ang app kahit alin — ang pag-install ang dahilan kung bakit gumagana ito nang walang signal.",
};

function Benefit({
  icon: Icon,
  label,
  detail,
}: {
  icon: typeof SignalZero;
  label: LocalizedText;
  detail: LocalizedText;
}) {
  const { lang } = useLanguage();
  return (
    <li className="flex gap-3">
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-severity-yellow" />
      <span>
        <span className="block font-medium">{t(label, lang)}</span>
        <span lang={lang} className="block text-sm text-muted-foreground">
          {t(detail, lang)}
        </span>
      </span>
    </li>
  );
}

/**
 * The final onboarding step. It comes after the zone is chosen rather than
 * before: a resident who has just named their own barangay is being asked to
 * protect that specific thing, not to install software in the abstract.
 *
 * The step never blocks — `onContinue` is always reachable, and choosing to
 * skip is recorded so this is asked once and not again.
 */
export function InstallStep({ onContinue }: { onContinue: () => void }) {
  const { lang } = useLanguage();
  const method = useInstallMethod();
  const [installed, setInstalled] = useState(false);

  async function handleInstall() {
    const accepted = await promptInstall();
    if (accepted) setInstalled(true);
    // A declined dialog is not a dead end: the manual instructions below
    // remain on screen, and Continue is still there.
  }

  const showRealButton = method === "prompt" && !installed;
  const alreadyInstalled = method === "installed" || installed;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p lang={lang} className="text-sm">
          {t(LEAD, lang)}
        </p>

        <ul className="space-y-3">
          <Benefit icon={SignalZero} label={BENEFIT_OFFLINE} detail={BENEFIT_OFFLINE_DETAIL} />
          <Benefit icon={Smartphone} label={BENEFIT_TAP} detail={BENEFIT_TAP_DETAIL} />
          <Benefit icon={Feather} label={BENEFIT_SIZE} detail={BENEFIT_SIZE_DETAIL} />
        </ul>

        {alreadyInstalled && (
          <p lang={lang} className="text-sm font-medium text-green-500">
            {t(INSTALLED_NOTE, lang)}
          </p>
        )}

        {!alreadyInstalled && method === "ios-manual" && (
          <p lang={lang} className="flex gap-2 rounded-md border-2 border-border p-3 text-sm">
            <Share aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {t(IOS_HOW, lang)}
          </p>
        )}

        {!alreadyInstalled && method === "browser-menu" && (
          <p lang={lang} className="rounded-md border-2 border-border p-3 text-sm">
            {t(BROWSER_HOW, lang)}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {showRealButton && (
            <Button type="button" size="lg" onClick={handleInstall}>
              <Download aria-hidden="true" className="h-4 w-4" />
              {t(INSTALL_ACTION, lang)}
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            variant={showRealButton || !alreadyInstalled ? "outline" : "default"}
            onClick={onContinue}
          >
            {t(alreadyInstalled ? CONTINUE : SKIP, lang)}
          </Button>
        </div>

        {!alreadyInstalled && (
          <p lang={lang} className="text-xs text-muted-foreground">
            {t(SKIP_NOTE, lang)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
