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
import {
  useAlerts,
  useConfirmAutomaticAlert,
  useRejectAutomaticAlert,
  useSetZoneAlert,
  useSetZoneAlerts,
} from "@/lib/alerts-store";
import { buildShareText, toSharedAlert } from "@/lib/alert-share/payload";
import { SEVERITY_LABEL, SEVERITY_ORDER, type Severity } from "@/lib/severity";
import { minutesSinceReport } from "@/lib/water-level-reports";
import type { AlertRecord, LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Needs your attention", fil: "Kailangan ng iyong pansin" };
const NOTHING: LocalizedText = { en: "Nothing needs you right now.", fil: "Walang kailangan sa iyo ngayon." };
// Rejecting costs the reporters their say (layer 6), so it is for a false
// advisory only; an all-clear goes through the barangay's own page.
const AUTO_NOTE: LocalizedText = {
  en: "Residents report flooding. Already shown as an unverified advisory. Reject it only if it is false: the phones that reported it stop counting toward automatic advisories.",
  fil: "May ulat ng baha mula sa mga residente. Nakalabas na bilang hindi pa kumpirmadong paalala. Tanggihan lamang kung mali ito: hindi na bibilangin ang mga teleponong nag-ulat nito para sa awtomatikong paalala.",
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
const SENT: LocalizedText = { en: "Alert sent — residents see it now.", fil: "Naipadala ang alerto — nakikita na ng mga residente." };
const CONFIRMED: LocalizedText = {
  en: "Confirmed — residents now see it as your barangay's alert.",
  fil: "Nakumpirma — nakikita na ito ng mga residente bilang alerto ng barangay.",
};
const KEPT: LocalizedText = { en: "Re-confirmed — the alert stays up.", fil: "Nakumpirma muli — mananatili ang alerto." };
const LIFTED: LocalizedText = { en: "Alert lifted.", fil: "Naalis ang alerto." };
const REJECTED: LocalizedText = { en: "Advisory rejected and withdrawn.", fil: "Tinanggihan at binawi ang paalala." };
const COPY_BY_HAND: LocalizedText = {
  en: "This browser won't copy for you. Select the text below and copy it.",
  fil: "Hindi makakopya ang browser na ito. Piliin ang teksto sa ibaba at kopyahin.",
};
const POST_TO_COPY: LocalizedText = { en: "Post to copy", fil: "Post na kokopyahin" };
const ALL_BARANGAYS: LocalizedText = { en: "All {n} barangays", fil: "Lahat ng {n} barangay" };
const SENT_TO_ALL: LocalizedText = {
  en: "Alert sent to {n} barangays — residents see it now.",
  fil: "Naipadala ang alerto sa {n} barangay — nakikita na ng mga residente.",
};
const SOME_FAILED: LocalizedText = {
  en: "Sent to {ok} of {n} barangays. Try again for the rest.",
  fil: "Naipadala sa {ok} sa {n} barangay. Subukang muli para sa iba.",
};

/** The picker value for "every barangay in this list" (a municipal official). */
const ALL = "__all__";

type Result = { ok: true } | { ok: false; error: string };

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
  const confirmAutomatic = useConfirmAutomaticAlert();
  const rejectAutomatic = useRejectAutomaticAlert();
  const setZoneAlerts = useSetZoneAlerts();
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pickedZone, setPickedZone] = useState("");
  const [pickedSeverity, setPickedSeverity] = useState<Severity>("yellow");
  // Which control is waiting on the server: that one spins, the rest wait.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;

  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const active = alerts.filter((a) => a.isActive && zoneById.has(a.zoneId));
  const needsReview = active.filter(
    (a) => a.source === "auto_crowdsourced" || minutesSinceReport(a.issuedAt) >= STALE_AFTER_MINUTES
  );

  async function run(key: string, action: () => Promise<Result>, done: LocalizedText) {
    setBusyKey(key);
    setError(null);
    setNotice(null);
    const result = await action();
    setBusyKey(null);
    if (result.ok) setNotice(t(done, lang));
    else setError(result.error);
  }
  const send = (key: string, zoneId: string, severity: Severity | "none", done: LocalizedText) =>
    run(key, () => setZoneAlert({ zoneId, severity }), done);

  async function sendToAll(severity: Severity) {
    setBusyKey("send");
    setError(null);
    setNotice(null);
    const { sent, failed } = await setZoneAlerts({ zoneIds: zones.map((z) => z.id), severity });
    setBusyKey(null);
    const n = String(sent + failed);
    if (failed === 0) setNotice(t(SENT_TO_ALL, lang).replace("{n}", n));
    else setError(t(SOME_FAILED, lang).replace("{ok}", String(sent)).replace("{n}", n));
  }

  async function copyPost(alert: AlertRecord, zone: Zone) {
    const text = buildShareText(toSharedAlert(alert, zone, lang), window.location.origin, lang);
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setManualCopy(null);
      setNotice(t(COPIED, lang));
    } catch {
      // Some browsers (and in-app ones like Facebook's) block the clipboard:
      // hand the official the text itself rather than an error.
      setManualCopy(text);
      setNotice(t(COPY_BY_HAND, lang));
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
                    <Button
                      type="button"
                      size="lg"
                      disabled={busy}
                      loading={busyKey === `${zone.id}:keep`}
                      onClick={() =>
                        automatic
                          ? run(`${zone.id}:keep`, () => confirmAutomatic(zone.id), CONFIRMED)
                          : send(`${zone.id}:keep`, zone.id, alert.severity, KEPT)
                      }
                    >
                      {t(automatic ? CONFIRM : STILL, lang)}
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      disabled={busy}
                      loading={busyKey === `${zone.id}:lift`}
                      onClick={() =>
                        automatic
                          ? run(`${zone.id}:lift`, () => rejectAutomatic(zone.id), REJECTED)
                          : send(`${zone.id}:lift`, zone.id, "none", LIFTED)
                      }
                    >
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
              if (pickedZone === ALL) void sendToAll(pickedSeverity);
              else if (pickedZone) void send("send", pickedZone, pickedSeverity, SENT);
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
                {zones.length > 1 && <option value={ALL}>{t(ALL_BARANGAYS, lang).replace("{n}", String(zones.length))}</option>}
                {[...zones]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((z) => (
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
            <Button type="submit" size="lg" className="w-full" disabled={busy || !pickedZone} loading={busyKey === "send"}>
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

        {manualCopy && (
          <textarea
            readOnly
            aria-label={t(POST_TO_COPY, lang)}
            value={manualCopy}
            rows={6}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border-2 border-border bg-background p-2 text-sm"
          />
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
