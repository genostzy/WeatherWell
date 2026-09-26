"use client";

import { useState } from "react";
import Link from "next/link";
import { Mountain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { describeElevation } from "@/lib/elevation";
import { hasConsented } from "@/features/onboarding/onboarding-storage";
import type { LocalizedText } from "@/lib/types";

const ASK: LocalizedText = { en: "How high am I?", fil: "Gaano ako kataas?" };
const HINT: LocalizedText = {
  en: "Uses your location once to compare your spot with your barangay centre. Not stored.",
  fil: "Gagamitin ang lokasyon mo nang isang beses para ikumpara sa gitna ng barangay. Hindi itatabi.",
};
const CHECKING: LocalizedText = { en: "Checking…", fil: "Tinitingnan…" };
const NO_LOCATION: LocalizedText = {
  en: "This needs your location. Allow it in your browser and try again.",
  fil: "Kailangan nito ang iyong lokasyon. Payagan ito sa browser at subukan muli.",
};
const READ_FIRST: LocalizedText = {
  en: "Before it uses your location, read ",
  fil: "Bago nito gamitin ang iyong lokasyon, basahin ",
};
const CONSENT_LINK: LocalizedText = {
  en: "how WeatherWell uses your location",
  fil: "kung paano ginagamit ng WeatherWell ang iyong lokasyon",
};
const FAILED: LocalizedText = {
  en: "Couldn't check the height right now. Try again later.",
  fil: "Hindi masuri ang taas ngayon. Subukan mamaya.",
};

type State =
  | { kind: "idle" }
  | { kind: "consent" }
  | { kind: "checking" }
  | { kind: "done"; text: LocalizedText }
  | { kind: "error"; text: LocalizedText };

/** Idea 8: is the spot where I stand low-lying, compared with my barangay? */
export function ElevationCheck({ zoneId }: { zoneId: string }) {
  const { lang } = useLanguage();
  const [state, setState] = useState<State>({ kind: "idle" });

  function check() {
    // Never before the consent notice: a shared /evacuation link opens without
    // onboarding, and the notice is what describes this lookup.
    if (!hasConsented()) {
      setState({ kind: "consent" });
      return;
    }
    if (!navigator.geolocation) {
      setState({ kind: "error", text: NO_LOCATION });
      return;
    }
    setState({ kind: "checking" });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        // In the body, never the address, which logs and history keep.
        const res = await fetch("/api/elevation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zoneId, lat: coords.latitude, lng: coords.longitude }),
        }).catch(() => null);
        const body = res?.ok ? ((await res.json()) as { here: number; centre: number }) : null;
        setState(body ? { kind: "done", text: describeElevation(body.here, body.centre) } : { kind: "error", text: FAILED });
      },
      () => setState({ kind: "error", text: NO_LOCATION }),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 }
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border-2 border-border p-4">
      <Button type="button" variant="outline" size="lg" className="w-full" loading={state.kind === "checking"} onClick={check}>
        <Mountain aria-hidden="true" className="h-4 w-4" />
        {t(state.kind === "checking" ? CHECKING : ASK, lang)}
      </Button>
      <p lang={lang} className="text-xs text-muted-foreground">
        {t(HINT, lang)}
      </p>
      {state.kind === "consent" && (
        <p role="status" lang={lang} className="text-sm font-medium">
          {t(READ_FIRST, lang)}
          <Link href="/onboarding" className="underline underline-offset-2">
            {t(CONSENT_LINK, lang)}
          </Link>
          .
        </p>
      )}
      {(state.kind === "done" || state.kind === "error") && (
        <p role="status" lang={lang} className="text-sm font-medium">
          {t(state.text, lang)}
        </p>
      )}
    </div>
  );
}
