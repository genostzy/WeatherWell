"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { decodeAlert } from "@/lib/alert-share/payload";
import { SEVERITY_BADGE_CLASS } from "@/lib/severity";
import type { LocalizedText } from "@/lib/types";

const FORWARDED: LocalizedText = {
  en: "Forwarded alert — not verified by this app",
  fil: "Ipinasang alerto — hindi pa napapatunayan ng app na ito",
};
const DAMAGED: LocalizedText = {
  en: "This alert link is damaged or incomplete. Ask whoever sent it to share it again.",
  fil: "Sira o kulang ang link na ito. Pakihingi muli sa nagpadala.",
};
const EVACUATE_TO: LocalizedText = { en: "Evacuate to", fil: "Lumikas sa" };
const OPEN_APP: LocalizedText = { en: "Open WeatherWell for my area", fil: "Buksan ang WeatherWell para sa aking lugar" };
const ISSUED: LocalizedText = { en: "Issued", fil: "Inilabas" };
const HOTLINE_CAUTION: LocalizedText = {
  en: "This number came from the person who sent this link, not from WeatherWell.",
  fil: "Ang numerong ito ay mula sa nagpadala ng link na ito, hindi mula sa WeatherWell.",
};

/**
 * Same subscribe shape as createLocalStorageStore's "storage" listener —
 * `hashchange` is the browser's own event for exactly this external state.
 * Needed for the rare but real case of a recipient opening a SECOND
 * forwarded-alert link in an already-mounted tab (an installed PWA reusing
 * its window, or browser back/forward between two /a links): without this,
 * the page keeps rendering the first alert's severity and evacuation centre
 * after the URL has already moved on to a different one.
 */
function subscribeToHash(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

/**
 * The payload arrives either as ?d=... (links made since idea 6, which the
 * server can render as plain HTML) or as #... (older links, and still read).
 * Offline, the service worker serves the cached /a page for any ?d= link, so
 * the client reads the query itself too.
 */
function getPayload(): string {
  return window.location.hash.replace(/^#/, "") || new URLSearchParams(window.location.search).get("d") || "";
}

/**
 * Renders an alert carried entirely in the URL fragment.
 *
 * The fragment is read on the client and never sent to the server by any
 * browser, which is the point: with the app already in the service worker's
 * cache this page renders a brand-new alert while completely offline. That
 * is the difference between showing a resident a stale cached alert and
 * actually delivering a new one through broken infrastructure.
 *
 * Reads the hash via useSyncExternalStore rather than useEffect+useState:
 * the fragment is external browser state (same category as localStorage,
 * see createLocalStorageStore), and this hook is what safely differs
 * between the server's snapshot (no fragment — it was never sent) and the
 * client's real one without a synchronous setState-in-effect or an
 * artificial "not ready yet" gate.
 */
export function SharedAlertView({ initialPayload = "" }: { initialPayload?: string }) {
  const { lang } = useLanguage();
  // The server snapshot is what the server read from ?d=, so the page it
  // renders (readable with no JavaScript at all) hydrates without a mismatch.
  const payload = useSyncExternalStore(subscribeToHash, () => getPayload() || initialPayload, () => initialPayload);
  const alert = decodeAlert(payload);

  if (!alert) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 pt-6">
          <p role="alert" lang={lang} className="text-sm">
            {t(DAMAGED, lang)}
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">{t(OPEN_APP, lang)}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const severityClass = alert.severityKey ? SEVERITY_BADGE_CLASS[alert.severityKey] : undefined;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-3">
        <p
          data-slot="notice"
          lang={lang}
          className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium"
        >
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t(FORWARDED, lang)}
        </p>
        <CardTitle className="text-lg">{alert.zoneName}</CardTitle>
        <p
          className={
            severityClass
              ? `inline-block w-fit rounded-md border px-2 py-0.5 text-sm font-semibold uppercase ${severityClass}`
              : "text-sm font-semibold uppercase"
          }
        >
          {alert.severity}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p lang={lang} className="text-sm">
          {alert.message}
        </p>

        {alert.centerName && (
          <p className="flex items-center gap-1.5 text-sm">
            <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            {t(EVACUATE_TO, lang)}: {alert.centerName}
          </p>
        )}

        {alert.hotline && (
          <div className="space-y-1">
            <Button asChild variant="outline" size="lg" className="w-full">
              <a href={`tel:${alert.hotline}`}>
                <Phone aria-hidden="true" className="h-4 w-4" />
                {alert.hotline}
              </a>
            </Button>
            <p lang={lang} className="text-xs text-muted-foreground">
              {t(HOTLINE_CAUTION, lang)}
            </p>
          </div>
        )}

        {(() => {
          const issued = new Date(alert.issuedAt);
          // isSharedAlert can only check that issuedAt is a string, not that
          // it parses — a corrupted-but-structurally-valid payload must not
          // render the literal "Invalid Date" text.
          if (Number.isNaN(issued.getTime())) return null;
          return (
            <p className="text-xs text-muted-foreground">
              {t(ISSUED, lang)}: {issued.toLocaleString(lang === "fil" ? "fil-PH" : "en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          );
        })()}

        <Button asChild variant="outline" className="w-full">
          <Link href="/">{t(OPEN_APP, lang)}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
