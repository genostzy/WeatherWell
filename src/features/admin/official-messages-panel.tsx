"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, LifeBuoy, MessagesSquare, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { useOfficial } from "@/lib/auth/official-context";
import { useZones } from "@/lib/reference-data/use-reference-data";
import { minutesSinceReport } from "@/lib/water-level-reports";
import type { MessageKind, OfficialMessage } from "@/lib/official-messages";
import type { LanguageCode, LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Updates", fil: "Mga update" };
const LOADING: LocalizedText = { en: "Loading updates…", fil: "Kinukuha ang mga update…" };
const NONE: LocalizedText = { en: "No updates yet.", fil: "Wala pang update." };
const FROM_TOWN: LocalizedText = { en: "From the town", fil: "Mula sa munisipyo" };
const SEEN_BY: LocalizedText = { en: "Seen by {name}", fil: "Nakita ni {name}" };
const MARK_SEEN: LocalizedText = { en: "Mark as seen", fil: "Markahang nakita" };
const NOTE: LocalizedText = { en: "Note (optional for the quick buttons)", fil: "Tala (opsyonal sa mabilis na button)" };
const SEND_UPDATE: LocalizedText = { en: "Send update", fil: "Ipadala ang update" };
const TO_EVERY: LocalizedText = { en: "Update to every barangay", fil: "Update sa bawat barangay" };
const SEND_TO_EVERY: LocalizedText = { en: "Send to every barangay", fil: "Ipadala sa bawat barangay" };
const SENT_UP: LocalizedText = { en: "Sent to {town}.", fil: "Naipadala sa {town}." };
const SENT_DOWN: LocalizedText = { en: "Sent to every barangay in {town}.", fil: "Naipadala sa bawat barangay sa {town}." };
const AGO: LocalizedText = { en: "{n} min ago", fil: "{n} min ang nakalipas" };
const HOURS_AGO: LocalizedText = { en: "{n} h ago", fil: "{n} oras ang nakalipas" };

const KIND: Record<MessageKind, LocalizedText> = {
  centre_full: { en: "Our centre is full", fil: "Puno na ang aming center" },
  need_help: { en: "We need help", fil: "Kailangan namin ng tulong" },
  all_clear: { en: "All clear here", fil: "Ligtas na rito" },
  update: { en: "Update", fil: "Update" },
};
const KIND_TONE: Record<MessageKind, string> = {
  centre_full: "text-severity-orange",
  need_help: "text-severity-red",
  all_clear: "text-green-500",
  update: "text-foreground",
};
const QUICK: { kind: MessageKind; icon: typeof Users }[] = [
  { kind: "centre_full", icon: Users },
  { kind: "need_help", icon: LifeBuoy },
  { kind: "all_clear", icon: CheckCircle2 },
];

/** How often a dashboard left open picks up new updates. */
const POLL_MS = 60_000;

/** null until the first answer; a failed refresh keeps what is on screen. */
function useTownMessages() {
  const [messages, setMessages] = useState<OfficialMessage[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/official-messages", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<OfficialMessage[]>) : null))
      .then((list) => {
        if (!cancelled) setMessages((m) => list ?? m ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessages((m) => m ?? []);
      });
    const timer = setTimeout(() => setTick((n) => n + 1), POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tick]);
  return { messages, reload: () => setTick((n) => n + 1) };
}

function age(createdAt: string, lang: LanguageCode): string {
  const minutes = Math.max(0, Math.round(minutesSinceReport(createdAt)));
  return minutes < 60 ? t(AGO, lang).replace("{n}", String(minutes)) : t(HOURS_AGO, lang).replace("{n}", String(Math.floor(minutes / 60)));
}

/**
 * The two-way line between a town and its barangays (RA 10121's BDRRMC and
 * MDRRMO). A barangay official tells the town, in one tap, that their centre
 * is full or they need help, and reads what the town sends; a municipal
 * official reads every barangay's updates, marks them seen, and sends one
 * update to all of them. Everyone appointed in the town sees the town's
 * updates, so a barangay also learns its neighbour's centre is full.
 */
export function OfficialMessagesPanel() {
  const { lang } = useLanguage();
  const official = useOfficial();
  const zones = useZones();
  const { messages, reload } = useTownMessages();
  const [note, setNote] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTown = official.level === "municipality";
  const townCode = official.areaCode.slice(0, 7);
  const townName = zones.find((z) => z.psgcBarangayCode.startsWith(townCode))?.municipalityName ?? official.areaName;
  const zoneName = (zoneId: string | null) => zones.find((z) => z.id === zoneId)?.name ?? "";

  async function act(key: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string) {
    setBusyKey(key);
    setError(null);
    setNotice(null);
    const result = await action();
    setBusyKey(null);
    if (result.ok) {
      if (done) setNotice(done);
      setNote("");
      reload();
    } else {
      setError(result.error);
    }
  }

  const send = (key: string, kind: MessageKind, body: string) =>
    act(
      key,
      async () => (await import("@/app/actions/official-messages")).sendOfficialMessage({ kind, body: body.trim() }),
      t(isTown ? SENT_DOWN : SENT_UP, lang).replace("{town}", townName)
    );
  const acknowledge = (id: string) =>
    act(id, async () => (await import("@/app/actions/official-messages")).acknowledgeOfficialMessage(id));

  const busy = busyKey !== null;
  // The town reads what still needs it first.
  const sorted = (messages ?? []).slice().sort((a, b) => {
    if (isTown) {
      const aOpen = a.direction === "up" && !a.acknowledgedAt;
      const bOpen = b.direction === "up" && !b.acknowledgedAt;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessagesSquare aria-hidden="true" className="h-5 w-5" />
          <span lang={lang}>{t(TITLE, lang)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isTown ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (note.trim()) void send("send", "update", note);
            }}
          >
            <Label htmlFor="town-update" lang={lang}>
              {t(TO_EVERY, lang)}
            </Label>
            <textarea
              id="town-update"
              value={note}
              maxLength={500}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border-2 border-border bg-background p-2 text-sm"
            />
            <Button type="submit" size="lg" className="w-full" disabled={busy || !note.trim()} loading={busyKey === "send"}>
              <Send aria-hidden="true" />
              <span lang={lang}>{t(SEND_TO_EVERY, lang)}</span>
            </Button>
          </form>
        ) : (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              {QUICK.map(({ kind, icon: Icon }) => (
                <Button
                  key={kind}
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={busy}
                  loading={busyKey === kind}
                  onClick={() => send(kind, kind, note)}
                >
                  <Icon aria-hidden="true" className={KIND_TONE[kind]} />
                  <span lang={lang}>{t(KIND[kind], lang)}</span>
                </Button>
              ))}
            </div>
            <Label htmlFor="barangay-update" lang={lang}>
              {t(NOTE, lang)}
            </Label>
            <textarea
              id="barangay-update"
              value={note}
              maxLength={500}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border-2 border-border bg-background p-2 text-sm"
            />
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={busy || !note.trim()}
              loading={busyKey === "update"}
              onClick={() => send("update", "update", note)}
            >
              <Send aria-hidden="true" />
              <span lang={lang}>{t(SEND_UPDATE, lang)}</span>
            </Button>
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

        {messages === null ? (
          <SkeletonRows label={t(LOADING, lang)} rows={3} />
        ) : sorted.length === 0 ? (
          <p lang={lang} className="text-sm text-muted-foreground">
            {t(NONE, lang)}
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((m) => {
              const DirectionIcon = m.direction === "up" ? ArrowUp : ArrowDown;
              return (
                <li key={m.id} className="space-y-1 rounded-md border-2 border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <DirectionIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span lang={lang} className="truncate">
                        {m.direction === "down" ? t(FROM_TOWN, lang) : zoneName(m.zoneId)} · {m.senderName}
                      </span>
                    </span>
                    <span>{age(m.createdAt, lang)}</span>
                  </div>
                  <p lang={lang} className={`text-sm font-semibold ${KIND_TONE[m.kind]}`}>
                    {t(KIND[m.kind], lang)}
                  </p>
                  {m.body && <p className="whitespace-pre-wrap text-sm">{m.body}</p>}
                  {m.direction === "up" &&
                    (m.acknowledgedAt ? (
                      <p lang={lang} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                        {t(SEEN_BY, lang).replace("{name}", m.acknowledgedByName ?? "")}
                      </p>
                    ) : (
                      isTown && (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          loading={busyKey === m.id}
                          onClick={() => acknowledge(m.id)}
                        >
                          <span lang={lang}>{t(MARK_SEEN, lang)}</span>
                        </Button>
                      )
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
