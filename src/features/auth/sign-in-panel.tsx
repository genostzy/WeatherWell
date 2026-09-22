"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { startGoogleSignIn, type SignInResult } from "@/lib/auth/sign-in";
import { isAdminPath } from "@/lib/auth/admin-path";
import type { LocalizedText } from "@/lib/types";

const OFFICIAL_HEADING: LocalizedText = { en: "Sign in as an official", fil: "Mag-sign in bilang opisyal" };
const RESIDENT_HEADING: LocalizedText = {
  en: "Keep your reports on a new phone",
  fil: "Panatilihin ang iyong mga ulat sa bagong telepono",
};
const OFFICIAL_DISCLAIMER: LocalizedText = {
  en: "Signing in does not make you an official. The system owner appoints officials.",
  fil: "Ang pag-sign in ay hindi ginagawa kang opisyal. Ang may-ari ng sistema ang nag-aatas ng mga opisyal.",
};
const CONTINUE_WITH_GOOGLE: LocalizedText = { en: "Continue with Google", fil: "Magpatuloy gamit ang Google" };
const FAILED_NOTICE: LocalizedText = {
  en: "That didn't work. If this Google account is already used on another phone, sign in to that account instead.",
  fil: "Hindi ito gumana. Kung ang Google account na ito ay ginagamit na sa ibang telepono, mag-sign in na lang doon.",
};
const SIGN_IN_EXISTING: LocalizedText = {
  en: "Sign in to your existing account",
  fil: "Mag-sign in sa iyong umiiral na account",
};
const CONTINUE_WITHOUT_ACCOUNT: LocalizedText = {
  en: "Continue — no account needed",
  fil: "Magpatuloy — hindi kailangan ng account",
};

type Control = "google" | "existing";

export function SignInPanel({ next, notice }: { next: string; notice?: string }) {
  const { lang } = useLanguage();
  const [pending, setPending] = useState<Control | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Control, string>>>({});

  const isOfficial = isAdminPath(next);
  const failed = notice === "failed";

  async function handleResult(control: Control, run: () => Promise<SignInResult>) {
    setPending(control);
    setErrors((prev) => ({ ...prev, [control]: undefined }));
    const result = await run();
    setPending(null);
    if (!result.ok) {
      setErrors((prev) => ({ ...prev, [control]: result.error }));
    }
    // Both controls leave the page themselves on success (an OAuth
    // redirect), so there is nothing left to do here.
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">
          {t(isOfficial ? OFFICIAL_HEADING : RESIDENT_HEADING, lang)}
        </CardTitle>
        {isOfficial && (
          <p lang={lang} className="text-sm text-muted-foreground">
            {t(OFFICIAL_DISCLAIMER, lang)}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {failed && (
          <div className="space-y-3 rounded-md border-2 border-severity-yellow/40 p-3">
            <p role="alert" lang={lang} className="text-sm">
              {t(FAILED_NOTICE, lang)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              disabled={pending === "existing"}
              onClick={() => handleResult("existing", () => startGoogleSignIn(next, { link: false }))}
            >
              {t(SIGN_IN_EXISTING, lang)}
            </Button>
            {errors.existing && (
              <p role="alert" className="text-sm text-destructive">
                {errors.existing}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={pending === "google"}
            onClick={() => handleResult("google", () => startGoogleSignIn(next))}
          >
            {t(CONTINUE_WITH_GOOGLE, lang)}
          </Button>
          {errors.google && (
            <p role="alert" className="text-sm text-destructive">
              {errors.google}
            </p>
          )}
        </div>

        {!isOfficial && (
          // A resident never needs an account — reports are attributed to an
          // anonymous session. /admin requires a real account (its own
          // layout redirects a signed-out visitor straight back here), so
          // this is omitted for the official heading rather than offering an
          // escape hatch that just bounces back.
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href={next}>{t(CONTINUE_WITHOUT_ACCOUNT, lang)}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
