"use client";

import { useEffect, useState } from "react";
import { MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { hasRealEvacuationCenter } from "@/lib/zone-data-quality";
import type { CandidateKind, CandidateSite } from "@/lib/osm-candidates";
import type { LocalizedText, Zone } from "@/lib/types";

const LIKELY: LocalizedText = {
  en: "Likely evacuation sites near you — not confirmed by your barangay",
  fil: "Posibleng evacuation site malapit sa iyo — hindi pa kumpirmado ng barangay",
};
const LOOKING: LocalizedText = { en: "Looking for nearby schools and halls…", fil: "Naghahanap ng malapit na paaralan at bulwagan…" };
const SOURCE: LocalizedText = { en: "From OpenStreetMap.", fil: "Mula sa OpenStreetMap." };
const OFFICIAL_TITLE: LocalizedText = { en: "Set your evacuation centre", fil: "Itakda ang evacuation center" };
const OFFICIAL_HINT: LocalizedText = {
  en: "Nearby schools and halls from OpenStreetMap. Confirm the one your barangay uses; residents see it instead of the placeholder.",
  fil: "Mga kalapit na paaralan at hall mula sa OpenStreetMap. Kumpirmahin ang ginagamit ng barangay; ito na ang makikita ng mga residente.",
};
const CAPACITY: LocalizedText = { en: "Capacity (people)", fil: "Kapasidad (tao)" };
const CONFIRM: LocalizedText = { en: "Confirm as our centre", fil: "Kumpirmahin bilang aming center" };
const SAVED: LocalizedText = {
  en: "Saved — residents will see it the next time their app loads.",
  fil: "Na-save — makikita ito ng mga residente sa susunod na buksan nila ang app.",
};
const KIND: Record<CandidateKind, LocalizedText> = {
  school: { en: "School", fil: "Paaralan" },
  hall: { en: "Barangay/town hall", fil: "Barangay/munisipyo" },
  community_centre: { en: "Community centre", fil: "Community center" },
  court: { en: "Covered court", fil: "Covered court" },
};

/** null while the search is still running (it can take a few seconds). */
function useCandidateSites(zoneId: string, enabled: boolean): CandidateSite[] | null {
  const [sites, setSites] = useState<CandidateSite[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`/api/evacuation-candidates?zoneId=${encodeURIComponent(zoneId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<CandidateSite[]>) : []))
      .then((list) => {
        if (!cancelled) setSites(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId, enabled]);
  return sites;
}

const distance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/** For residents whose barangay has no verified centre: somewhere plausible to head for, honestly labelled. */
export function CandidateSites({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const needed = !hasRealEvacuationCenter(zone);
  const sites = useCandidateSites(zone.id, needed);
  if (!needed || sites?.length === 0) return null;
  if (!sites) return <SkeletonRows label={t(LOOKING, lang)} className="rounded-lg border-2 border-dashed border-border p-4" />;

  return (
    <div className="space-y-2 rounded-lg border-2 border-dashed border-border p-4">
      <p lang={lang} className="flex items-center gap-2 text-sm font-medium">
        <MapPinned aria-hidden="true" className="h-4 w-4 shrink-0" />
        {t(LIKELY, lang)}
      </p>
      <ul className="space-y-1 text-sm">
        {sites.map((s) => (
          <li key={`${s.lat},${s.lng}`} className="flex justify-between gap-2">
            <span className="min-w-0">
              <span className="font-medium">{s.name}</span>{" "}
              <span className="text-muted-foreground">· {t(KIND[s.kind], lang)}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{distance(s.distanceM)}</span>
          </li>
        ))}
      </ul>
      <p lang={lang} className="text-xs text-muted-foreground">
        {t(SOURCE, lang)}
      </p>
    </div>
  );
}

/** For an official: turn a suggestion into the barangay's real centre. */
export function ConfirmCentrePanel({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const sites = useCandidateSites(zone.id, true) ?? [];
  const [capacity, setCapacity] = useState<Record<string, string>>({});
  // The site being confirmed, so only its button spins.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (sites.length === 0) return null;

  async function confirm(site: CandidateSite) {
    const key = `${site.lat},${site.lng}`;
    setBusyKey(key);
    setError(null);
    setNotice(null);
    const { confirmEvacuationCenter } = await import("@/app/actions/confirm-evacuation-center");
    const result = await confirmEvacuationCenter({
      zoneId: zone.id,
      name: site.name,
      lat: site.lat,
      lng: site.lng,
      capacity: Number(capacity[key] ?? "0"),
    });
    setBusyKey(null);
    if (result.ok) setNotice(t(SAVED, lang));
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPinned aria-hidden="true" className="h-5 w-5" />
          <span lang={lang}>{t(OFFICIAL_TITLE, lang)}</span>
        </CardTitle>
        <p lang={lang} className="text-xs text-muted-foreground">
          {t(OFFICIAL_HINT, lang)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {sites.map((site) => {
          const key = `${site.lat},${site.lng}`;
          return (
            <div key={key} className="space-y-2 rounded-md border-2 border-border p-3">
              <p className="text-sm">
                <span className="font-medium">{site.name}</span>{" "}
                <span className="text-muted-foreground">
                  · {t(KIND[site.kind], lang)} · {distance(site.distanceM)}
                </span>
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`cap-${key}`}>{t(CAPACITY, lang)}</Label>
                  <Input
                    id={`cap-${key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="w-32"
                    value={capacity[key] ?? ""}
                    onChange={(e) => setCapacity((c) => ({ ...c, [key]: e.target.value }))}
                  />
                </div>
                <Button type="button" disabled={busyKey !== null} loading={busyKey === key} onClick={() => confirm(site)}>
                  {t(CONFIRM, lang)}
                </Button>
              </div>
            </div>
          );
        })}
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
