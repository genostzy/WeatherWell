"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { usePushSubscription, type SubscribeResult } from "@/lib/push-subscription";
import type { LocalizedText } from "@/lib/types";

const ENABLE_PUSH: LocalizedText = { en: "Turn on alerts", fil: "I-on ang mga alerto" };
const DISABLE_PUSH: LocalizedText = { en: "Turn off alerts", fil: "I-off ang mga alerto" };

const PUSH_DESCRIPTION: LocalizedText = {
  en: "Get a notification on this phone when your barangay has a flood alert, even with WeatherWell closed.",
  fil: "Makatanggap ng abiso sa teleponong ito kapag may alerto ng baha ang inyong barangay, kahit nakasara ang WeatherWell.",
};

const PUSH_NOT_SUPPORTED: LocalizedText = {
  en: "This browser can't show alerts. On an iPhone, add WeatherWell to your Home Screen first.",
  fil: "Hindi makapagpakita ng alerto ang browser na ito. Sa iPhone, idagdag muna ang WeatherWell sa Home Screen.",
};

const PUSH_PERMISSION_DENIED: LocalizedText = {
  en: "Alerts are blocked for this site. Allow notifications in your browser's site settings, then come back.",
  fil: "Naka-block ang alerto sa site na ito. Payagan ang notifications sa site settings ng browser, saka bumalik.",
};

/** What to say for each way subscribing can end short of "subscribed". */
const WHY: Record<Exclude<SubscribeResult, "subscribed">, LocalizedText> = {
  "no-zone": { en: "Choose your barangay first, then turn on alerts.", fil: "Piliin muna ang inyong barangay, saka i-on ang alerto." },
  "not-configured": {
    en: "Alerts aren't set up on the server yet.",
    fil: "Hindi pa naka-set up ang alerto sa server.",
  },
  "no-session": {
    en: "Turning on alerts needs a connection. Try again when you're online.",
    fil: "Kailangan ng koneksyon para i-on ang alerto. Subukang muli kapag online na.",
  },
  denied: PUSH_PERMISSION_DENIED,
  failed: {
    en: "Couldn't turn on alerts on this phone. Try again, or try another browser.",
    fil: "Hindi ma-on ang alerto sa teleponong ito. Subukang muli, o gumamit ng ibang browser.",
  },
};
const ON: LocalizedText = { en: "Alerts are on for this phone.", fil: "Naka-on na ang alerto sa teleponong ito." };

/**
 * Turns flood alerts on or off for this phone, and always says what
 * happened: a failure used to end the spinner silently.
 */
export function PushPrompt({ zoneId }: { zoneId?: string }) {
  const { lang } = useLanguage();
  const { state, subscribe, unsubscribe } = usePushSubscription(zoneId);
  const [isToggling, setIsToggling] = useState(false);
  const [result, setResult] = useState<SubscribeResult | null>(null);

  if (state.isLoading) return null;

  if (!state.isSupported) {
    return (
      <p lang={lang} className="text-sm text-muted-foreground">
        {t(PUSH_NOT_SUPPORTED, lang)}
      </p>
    );
  }

  if (state.permission === "denied") {
    return (
      <p lang={lang} className="text-sm text-muted-foreground">
        {t(PUSH_PERMISSION_DENIED, lang)}
      </p>
    );
  }

  const isSubscribed = !!state.subscription;

  const handleToggle = async () => {
    setIsToggling(true);
    setResult(null);
    try {
      if (isSubscribed) await unsubscribe();
      else setResult(await subscribe());
    } catch {
      setResult("failed");
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={isSubscribed ? "outline" : "default"}
        size="lg"
        onClick={handleToggle}
        loading={isToggling}
      >
        <span lang={lang}>{isSubscribed ? t(DISABLE_PUSH, lang) : t(ENABLE_PUSH, lang)}</span>
      </Button>
      {result === "subscribed" && (
        <p role="status" lang={lang} className="text-sm text-green-500">
          {t(ON, lang)}
        </p>
      )}
      {result && result !== "subscribed" && (
        <p role="alert" lang={lang} className="text-sm text-destructive">
          {t(WHY[result], lang)}
        </p>
      )}
      {!isSubscribed && !result && (
        <p lang={lang} className="text-xs text-muted-foreground">
          {t(PUSH_DESCRIPTION, lang)}
        </p>
      )}
    </div>
  );
}
