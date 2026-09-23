"use client";

import { useState } from "react";
import { Copy, Inbox, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SeverityBadge } from "@/features/alerts/severity-badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { useAlerts, useSetZoneAlert } from "@/lib/alerts-store";
import { buildShareText, toSharedAlert } from "@/lib/alert-share/payload";
import { SEVERITY_LABEL, SEVERITY_ORDER, type Severity } from "@/lib/severity";
import { minutesSinceReport } from "@/lib/water-level-reports";
import type { AlertRecord, LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Needs your attention", fil: "Kailangan ng iyong pansin" };
const NOTHING: LocalizedText = { en: "Nothing needs you right now.", fil: "Walang kailangan sa iyo ngayon." };
const AUTO_NOTE: LocalizedText = {
  en: "Residents report flooding. Already shown as an unverified advisory.",
  fil: "May ulat ng baha mula sa mga residente. Nakalabas na bilang hindi pa kumpirmadong paalala.",
};
const STALE_NOTE: LocalizedText = { en: "Your alert is over a day old. Is it still in effect?", fil: "Mahigit isang araw na ang alerto mo. May bisa pa ba?" };
const CONFIRM: LocalizedText = { en: "Confirm", fil: "Kumpirmahin" };
const REJECT: LocalizedText = { en: "Reject", fil: "Tanggihan" };
const STILL: LocalizedText = { en: "Still in effect", fil: "May bisa pa" };
const LIFT: LocalizedText = { en: "Lift", fil: "Alisin" };
const SET_ALERT: LocalizedText = { en: "Set an alert", fil: "Maglabas ng alerto" };
const BARANGAY: LocalizedText = { en: "Barangay", fil: "Barangay" };
const CHOOSE: LocalizedText = { en: "Choose…", fil: "Pumili…" };
const SEND: LocalizedText = { en: "Send alert", fil: "Ipadala ang alerto" };
const ACTIVE: LocalizedText = { en: "Active alerts", fil: "Mga aktibong alerto" };
const COPY_POST: LocalizedText = { en: "Copy post for Facebook", fil: "Kopyahin ang post para sa Facebook" };
const COPIED: LocalizedText = { en: "Copied — paste it into your page or group chat.", fil: "Nakopya — i-paste sa inyong page o group chat." };
const SENT: LocalizedText = { en: "Sent.", fil: "Naipadala." };

const STALE_AFTER_MINUTES = 24 * 60;
/** Past this, a barangay picker is a 42k-row select; a nationwide admin uses the map instead. */
const MAX_PICKER_ZONES = 500;

/**
 * The official's phone-first home (idea 5): what needs a decision, a
 * three-step way to raise an alert, and each active alert as a post ready
 * for the Facebook page or group chat officials already use.
 *
 * Automatic advisories publish at once, labelled unverified; this is where
 * an official confirms (re-issues it as their own) or rejects (clears) it
 * (idea 4). An official's own alert never expires on its own; past a day it
 * is listed here to re-confirm or lift (idea 13). Both go through
 * setZoneAlert, so the database's own area check still applies.
 */
export function OfficialInbox({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const alerts = useAlerts();
  const setZoneAlert = useSetZoneAlert();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pickedZone, setPickedZone] = useState("");
  const [pickedSeverity, setPickedSeverity] = useState<Severity>("yellow");
  const [busy, setBusy] = useState(false);

  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const active = alerts.filter((a) => a.isActive && zoneById.has(a.zoneId));
  const needsReview = active.filter(
    (a) => a.source === "auto_crowdsourced" || minutesSinceReport(a.issuedAt) >= STALE_AFTER_MINUTES
  );

  async function send(zoneId: string, severity: Severity | "none") {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await setZoneAlert({ zoneId, severity });
    setBusy(false);
    if (result.ok) setNotice(t(SENT, lang));
    else setError(result.error);
  }

  async function copyPost(alert: AlertRecord, zone: Zone) {
    try {
      await navigator.clipboard.writeText(buildShareText(toSharedAlert(alert, zone, lang), window.location.origin, lang));
      setNotice(t(COPIED, lang));
    } catch {
      setError("Clipboard unavailable");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox aria-hidden="true" className="h-5 w-5" />
          <span lang={lang}>{t(TITLE, lang)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {needsReview.length === 0 ? (
          <p lang={lang} className="text-sm text-muted-foreground">
            {t(NOTHING, lang)}
          </p>
        ) : (
          <ul className="space-y-3">
            {needsReview.map((alert) => {
              const zone = zoneById.get(alert.zoneId)!;
              const automatic = alert.source === "auto_crowdsourced";
              return (
                <li key={alert.id} aria-label={zone.name} className="space-y-2 rounded-md border-2 border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{zone.name}</span>
                    <SeverityBadge severity={alert.severity} />
                  </div>
                  <p lang={lang} className="text-sm text-muted-foreground">
                    {t(automatic ? AUTO_NOTE : STALE_NOTE, lang)}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" size="lg" disabled={busy} onClick={() => send(zone.id, alert.severity)}>
                      {t(automatic ? CONFIRM : STILL, lang)}
                    </Button>
                    <Button type="button" size="lg" variant="outline" disabled={busy} onClick={() => send(zone.id, "none")}>
                      {t(automatic ? REJECT : LIFT, lang)}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {zones.length <= MAX_PICKER_ZONES && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (pickedZone) void send(pickedZone, pickedSeverity);
            }}
          >
            <p lang={lang} className="text-sm font-medium">
              {t(SET_ALERT, lang)}
            </p>
            <div className="space-y-1">
              <Label htmlFor="inbox-zone">{t(BARANGAY, lang)}</Label>
              <select
                id="inbox-zone"
                value={pickedZone}
                onChange={(e) => setPickedZone(e.target.value)}
                className="h-11 w-full rounded-md border-2 border-border bg-background px-3 text-sm"
              >
                <option value="">{t(CHOOSE, lang)}</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <div role="radiogroup" aria-label="Severity" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SEVERITY_ORDER.map((severity) => (
                <label
                  key={severity}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 border-border px-3 text-sm has-[:checked]:border-foreground"
                >
                  <input
                    type="radio"
                    name="inbox-severity"
                    value={severity}
                    checked={pickedSeverity === severity}
                    onChange={() => setPickedSeverity(severity)}
                  />
                  {t(SEVERITY_LABEL[severity], lang)}
                </label>
              ))}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy || !pickedZone}>
              <Send aria-hidden="true" className="h-4 w-4" />
              {t(SEND, lang)}
            </Button>
          </form>
        )}

        {active.length > 0 && (
          <div className="space-y-2">
            <p lang={lang} className="text-sm font-medium">
              {t(ACTIVE, lang)}
            </p>
            <ul className="space-y-2">
              {active.map((alert) => {
                const zone = zoneById.get(alert.zoneId)!;
                return (
                  <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <SeverityBadge severity={alert.severity} />
                      <span className="truncate">{zone.name}</span>
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={() => copyPost(alert, zone)}>
                      <Copy aria-hidden="true" className="h-4 w-4" />
                      {t(COPY_POST, lang)}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {notice && (
          <p role="status" lang={lang} className="text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {friendlyError(error, lang)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
