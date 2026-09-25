"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { getSelectedZoneId } from "@/features/onboarding/onboarding-storage";
import { getBrowserClient } from "@/lib/supabase/browser";
import { friendlyError } from "@/lib/friendly-error";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Email alerts", fil: "Mga alerto sa email" };
const EXPLAIN: LocalizedText = {
  en: "Email your barangay's flood alerts to {email}. Every email has a link to stop them.",
  fil: "Ipadala sa {email} ang mga alerto ng baha ng iyong barangay. May link sa bawat email para itigil ang mga ito.",
};
const TURN_ON: LocalizedText = { en: "Turn on email alerts", fil: "I-on ang mga alerto sa email" };
const TURN_OFF: LocalizedText = { en: "Turn off email alerts", fil: "I-off ang mga alerto sa email" };
const ON: LocalizedText = { en: "Email alerts are on.", fil: "Naka-on ang mga alerto sa email." };

/**
 * Opt-in email alerts, for an account signed in with Google. Off until the
 * resident turns them on (RA 10173 consent), and follows the barangay this
 * phone has chosen.
 */
export function EmailAlertsCard({ email }: { email: string }) {
  const { lang } = useLanguage();
  const [on, setOn] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getBrowserClient()
      .from("email_alert_subscriptions")
      .select("zone_id")
      .maybeSingle()
      .then(async ({ data }) => {
        setOn(!!data);
        // Follows a change of barangay, the way a push subscription does.
        const zoneId = getSelectedZoneId();
        if (data && zoneId && data.zone_id !== zoneId) {
          const { subscribeEmailAlerts } = await import("@/app/actions/email-alerts");
          await subscribeEmailAlerts(zoneId);
        }
      });
  }, []);

  async function toggle() {
    setPending(true);
    setError(null);
    const actions = await import("@/app/actions/email-alerts");
    const result = on ? await actions.unsubscribeEmailAlerts() : await actions.subscribeEmailAlerts(getSelectedZoneId());
    setPending(false);
    if (result.ok) setOn(!on);
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t(TITLE, lang)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p lang={lang} className="text-sm text-muted-foreground">
          {t(EXPLAIN, lang).replace("{email}", email)}
        </p>
        {on && (
          <p role="status" lang={lang} className="text-sm text-green-500">
            {t(ON, lang)}
          </p>
        )}
        <Button
          type="button"
          size="sm"
          variant={on ? "outline" : "default"}
          disabled={on === null}
          loading={pending}
          onClick={() => void toggle()}
        >
          {t(on ? TURN_OFF : TURN_ON, lang)}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {friendlyError(error, lang)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
