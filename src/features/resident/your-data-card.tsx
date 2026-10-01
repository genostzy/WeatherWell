"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OverlayDialog } from "@/components/overlay-dialog";
import { useLanguage } from "@/features/i18n/language-provider";
import { getBrowserClient } from "@/lib/supabase/browser";
import { forgetThisPhone } from "@/lib/forget-this-phone";
import { friendlyError } from "@/lib/friendly-error";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Your data", fil: "Ang iyong data" };
const EXPLAIN: LocalizedText = {
  en: "Download everything WeatherWell holds about you, or delete it.",
  fil: "I-download ang lahat ng hawak ng WeatherWell tungkol sa iyo, o burahin ito.",
};
const DOWNLOAD: LocalizedText = { en: "Download my data", fil: "I-download ang aking data" };
const DELETE: LocalizedText = { en: "Delete my data", fil: "Burahin ang aking data" };
const WHAT_HAPPENS: LocalizedText[] = [
  {
    en: "Your reports stay in your barangay's counts, without your account or location.",
    fil: "Mananatili ang iyong mga ulat sa bilang ng barangay, nang wala ang iyong account o lokasyon.",
  },
  {
    en: "Your pins stay on the map without your account; their photos are deleted.",
    fil: "Mananatili sa mapa ang iyong mga pin nang wala ang iyong account; buburahin ang mga larawan nito.",
  },
  {
    en: "Your votes, check-ins, alerts, security questions and account are deleted.",
    fil: "Buburahin ang iyong mga boto, check-in, alerto, security questions at account.",
  },
  {
    en: "This phone is signed out and starts again.",
    fil: "Mag-sa-sign out ang teleponong ito at magsisimula muli.",
  },
];
const TYPE_DELETE: LocalizedText = { en: "Type DELETE to confirm", fil: "I-type ang DELETE para kumpirmahin" };
const CONFIRM: LocalizedText = { en: "Delete everything", fil: "Burahin lahat" };
const CANCEL: LocalizedText = { en: "Cancel", fil: "Kanselahin" };
const CLOSE: LocalizedText = { en: "Close", fil: "Isara" };
const DELETED: LocalizedText = { en: "Your data is deleted.", fil: "Nabura na ang iyong data." };

/**
 * A resident's data rights (RA 10173): download what WeatherWell holds about
 * them, and delete it. Deleting asks them to type DELETE, says first what
 * stays and what goes, and afterwards signs this phone out and starts it
 * again. Shown to residents only; officials' records are the town's.
 */
export function YourDataCard() {
  const { lang } = useLanguage();
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function remove() {
    setBusy(true);
    setProblem(null);
    try {
      const { deleteMyData } = await import("@/app/actions/delete-my-data");
      const result = await deleteMyData();
      if (!result.ok) {
        setProblem(friendlyError(result.error, lang));
        return;
      }
      setDone(true);
      await forgetThisPhone();
      await getBrowserClient().auth.signOut();
      router.push("/onboarding");
    } catch (error) {
      setProblem(friendlyError(error instanceof Error ? error.message : String(error), lang));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setTyped("");
    setProblem(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t(TITLE, lang)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p lang={lang} className="text-sm text-muted-foreground">
          {t(EXPLAIN, lang)}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/my-data" download className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Download aria-hidden="true" />
            <span lang={lang}>{t(DOWNLOAD, lang)}</span>
          </a>
          <Button type="button" variant="destructive" size="lg" onClick={() => setOpen(true)}>
            <Trash2 aria-hidden="true" />
            <span lang={lang}>{t(DELETE, lang)}</span>
          </Button>
        </div>
      </CardContent>
      {open && (
        <OverlayDialog onClose={close} label={t(DELETE, lang)} closeLabel={t(CLOSE, lang)} className="max-w-sm">
          <Card>
            <CardHeader>
              <CardTitle className="pr-8 text-base">{t(DELETE, lang)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul lang={lang} className="list-disc space-y-1 pl-5 text-sm">
                {WHAT_HAPPENS.map((line) => (
                  <li key={line.en}>{t(line, lang)}</li>
                ))}
              </ul>
              <div className="space-y-1">
                <Label htmlFor={inputId} lang={lang}>
                  {t(TYPE_DELETE, lang)}
                </Label>
                <Input
                  id={inputId}
                  autoComplete="off"
                  autoCapitalize="characters"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                />
              </div>
              {problem && (
                <p role="alert" lang={lang} className="text-sm text-destructive">
                  {problem}
                </p>
              )}
              {done && (
                <p role="status" lang={lang} className="text-sm">
                  {t(DELETED, lang)}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  disabled={typed !== "DELETE" || done}
                  loading={busy}
                  onClick={() => void remove()}
                >
                  <span lang={lang}>{t(CONFIRM, lang)}</span>
                </Button>
                <Button type="button" variant="outline" size="lg" disabled={busy} onClick={close}>
                  <span lang={lang}>{t(CANCEL, lang)}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </OverlayDialog>
      )}
    </Card>
  );
}
