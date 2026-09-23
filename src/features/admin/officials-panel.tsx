"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { appointOfficial } from "@/app/actions/appoint-official";
import { removeOfficial } from "@/app/actions/remove-official";
import type { LocalizedText } from "@/lib/types";

const EMAIL_LABEL: LocalizedText = { en: "Email", fil: "Email" };
const AREA_LABEL: LocalizedText = {
  en: 'Area (e.g. "Barangay Nilombot, Mapandan" or "Mapandan")',
  fil: 'Lugar (hal. "Barangay Nilombot, Mapandan" o "Mapandan")',
};
const DISPLAY_NAME_LABEL: LocalizedText = { en: "Display name", fil: "Ipapakitang pangalan" };
const APPOINT: LocalizedText = { en: "Appoint", fil: "Italaga" };
const REMOVE: LocalizedText = { en: "Remove", fil: "Alisin" };
const CURRENT_OFFICIALS: LocalizedText = { en: "Current officials", fil: "Kasalukuyang mga opisyal" };
const NO_OFFICIALS: LocalizedText = { en: "No officials appointed yet.", fil: "Wala pang itinalagang opisyal." };

export interface OfficialRow {
  email: string;
  displayName: string;
  areaName: string;
}

export function OfficialsPanel({ officials }: { officials: OfficialRow[] }) {
  const { lang } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [area, setArea] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState<"appoint" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAppoint(event: React.FormEvent) {
    event.preventDefault();
    setPending("appoint");
    setError(null);
    const result = await appointOfficial({ email, area, displayName });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail("");
    setArea("");
    setDisplayName("");
    router.refresh();
  }

  async function handleRemove(targetEmail: string) {
    setPending(targetEmail);
    setError(null);
    const result = await removeOfficial({ email: targetEmail });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAppoint} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="official-email">{t(EMAIL_LABEL, lang)}</Label>
          <Input
            id="official-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending === "appoint"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="official-area">{t(AREA_LABEL, lang)}</Label>
          <Input
            id="official-area"
            type="text"
            required
            value={area}
            onChange={(event) => setArea(event.target.value)}
            disabled={pending === "appoint"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="official-display-name">{t(DISPLAY_NAME_LABEL, lang)}</Label>
          <Input
            id="official-display-name"
            type="text"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={pending === "appoint"}
          />
        </div>
        <Button type="submit" size="lg" disabled={pending === "appoint"}>
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
          {t(CURRENT_OFFICIALS, lang)}
        </h2>
        {officials.length === 0 && (
          <p lang={lang} className="text-sm text-muted-foreground">
            {t(NO_OFFICIALS, lang)}
          </p>
        )}
        <ul className="space-y-2">
          {officials.map((official) => (
            <li
              key={official.email}
              className="flex items-center justify-between gap-3 rounded-md border-2 border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{official.displayName}</p>
                <p className="truncate text-sm text-muted-foreground">{official.areaName}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pending === official.email}
                onClick={() => handleRemove(official.email)}
              >
                {t(REMOVE, lang)}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
