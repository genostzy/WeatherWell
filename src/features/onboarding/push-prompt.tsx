"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { usePushSubscription } from "@/lib/push-subscription";
import type { LocalizedText } from "@/lib/types";

const ENABLE_PUSH: LocalizedText = {
  en: "Enable Notifications",
  fil: " paganahin ang mga Abiso",
};

const DISABLE_PUSH: LocalizedText = {
  en: "Disable Notifications",
  fil: " Disable ang mga Abiso",
};

const PUSH_DESCRIPTION: LocalizedText = {
  en: "Get alerted when your zone has a flood warning.",
  fil: "Makatanggap ng abiso kapag may flood warning sa iyong zone.",
};

const PUSH_NOT_SUPPORTED: LocalizedText = {
  en: "Notifications not supported on this device",
  fil: "Hinid suportado ang mga abiso sa device na ito",
};

const PUSH_PERMISSION_DENIED: LocalizedText = {
  en: "Notifications blocked — enable in browser settings",
  fil: "Naka-block ang abiso — paganahin sa browser settings",
};

/**
 * Button to subscribe/unsubscribe from push notifications.
 * Shows the current state and allows toggling.
 */
export function PushPrompt({ zoneId }: { zoneId?: string }) {
  const { lang } = useLanguage();
  const { state, subscribe, unsubscribe } = usePushSubscription(zoneId);
  const [isToggling, setIsToggling] = useState(false);

  if (state.isLoading) return null;

  if (!state.isSupported) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(PUSH_NOT_SUPPORTED, lang)}
      </p>
    );
  }

  if (state.permission === "denied") {
    return (
      <p className="text-sm text-muted-foreground">
        {t(PUSH_PERMISSION_DENIED, lang)}
      </p>
    );
  }

  const isSubscribed = !!state.subscription;

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      if (isSubscribed) {
        await unsubscribe();
      } else {
        await subscribe();
      }
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={isSubscribed ? "outline" : "default"}
        size="sm"
        onClick={handleToggle}
        loading={isToggling}
      >
        {isSubscribed ? t(DISABLE_PUSH, lang) : t(ENABLE_PUSH, lang)}
      </Button>
      {!isSubscribed && (
        <p className="text-xs text-muted-foreground">
          {t(PUSH_DESCRIPTION, lang)}
        </p>
      )}
    </div>
  );
}
