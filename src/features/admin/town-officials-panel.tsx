"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { useOfficial } from "@/lib/auth/official-context";
import { isInArea } from "@/lib/auth/official";
import { useZones } from "@/lib/reference-data/use-reference-data";
import type { TownOfficial } from "@/features/admin/town-barangays-panel";
import type { LocalizedText } from "@/lib/types";

const INTRO: LocalizedText = {
  en: "Appoint one official per barangay so each barangay can confirm alerts, run its centre and send updates to the town. They sign in once with their email first.",
  fil: "Magtalaga ng isang opisyal bawat barangay para makumpirma nila ang alerto, mapatakbo ang center at makapagpadala ng update sa munisipyo. Mag-sign in muna sila minsan gamit ang email.",
};
const EMAIL: LocalizedText = { en: "Email", fil: "Email" };
const BARANGAY: LocalizedText = { en: "Barangay", fil: "Barangay" };
const CHOOSE: LocalizedText = { en: "Choose…", fil: "Pumili…" };
const DISPLAY_NAME: LocalizedText = { en: "Display name", fil: "Ipapakitang pangalan" };
const DISPLAY_HINT: LocalizedText = { en: "e.g. Juan Dela Cruz, BDRRMC Nilombot", fil: "hal. Juan Dela Cruz, BDRRMC Nilombot" };
const APPOINT: LocalizedText = { en: "Appoint", fil: "Italaga" };
const REMOVE: LocalizedText = { en: "Remove", fil: "Alisin" };
const CURRENT: LocalizedText = { en: "Barangay officials in {town}", fil: "Mga opisyal ng barangay sa {town}" };
const NONE: LocalizedText = { en: "No barangay officials appointed yet.", fil: "Wala pang itinalagang opisyal ng barangay." };

/**
 * A municipal official's own officials page: appoint and remove the
 * barangay officials in their town. The database checks every rule (their
 * town only, nobody else's official); this only offers the town's barangays.
 */
export function TownOfficialsPanel({ officials }: { officials: TownOfficial[] }) {
  const { lang } = useLanguage();
  const router = useRouter();
  const official = useOfficial();
  const zones = useZones()
    .filter((z) => isInArea(z.psgcBarangayCode, official.areaCode))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [email, setEmail] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const zoneNameByCode = new Map(zones.map((z) => [z.psgcBarangayCode, z.name]));

  async function appoint(event: React.FormEvent) {
    event.preventDefault();
    setPending("appoint");
    setError(null);
    const { appointBarangayOfficial } = await import("@/app/actions/town-officials");
    const result = await appointBarangayOfficial({ email: email.trim(), zoneId, displayName: displayName.trim() });
    setPending(null);
    if (!result.ok) return setError(result.error);
    setEmail("");
    setZoneId("");
    setDisplayName("");
    router.refresh();
  }

  async function remove(userId: string) {
    setPending(userId);
    setError(null);
    const { removeBarangayOfficial } = await import("@/app/actions/town-officials");
    const result = await removeBarangayOfficial(userId);
    setPending(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <p lang={lang} className="text-sm text-muted-foreground">
        {t(INTRO, lang)}
      </p>
      <form onSubmit={appoint} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="town-official-email">{t(EMAIL, lang)}</Label>
          <Input
            id="town-official-email"
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending === "appoint"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="town-official-zone">{t(BARANGAY, lang)}</Label>
          <select
            id="town-official-zone"
            required
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            disabled={pending === "appoint"}
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
        <div className="space-y-1">
          <Label htmlFor="town-official-name">{t(DISPLAY_NAME, lang)}</Label>
          <Input
            id="town-official-name"
            type="text"
            required
            placeholder={t(DISPLAY_HINT, lang)}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={pending === "appoint"}
          />
        </div>
        <Button type="submit" size="lg" disabled={pending !== null && pending !== "appoint"} loading={pending === "appoint"}>
          {t(APPOINT, lang)}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {friendlyError(error, lang)}
          </p>
        )}
      </form>

      <div className="space-y-2">
        <h2 lang={lang} className="text-sm font-medium">
          {t(CURRENT, lang).replace("{town}", official.areaName)}
        </h2>
        {officials.length === 0 ? (
          <p lang={lang} className="text-sm text-muted-foreground">
            {t(NONE, lang)}
          </p>
        ) : (
          <ul className="space-y-2">
            {officials.map((o) => (
              <li key={o.userId} className="flex items-center justify-between gap-3 rounded-md border-2 border-border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.displayName}</p>
                  <p className="truncate text-sm text-muted-foreground">{zoneNameByCode.get(o.areaCode) ?? o.areaCode}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={pending !== null}
                  loading={pending === o.userId}
                  onClick={() => remove(o.userId)}
                >
                  {t(REMOVE, lang)}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
