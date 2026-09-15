"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { startGoogleSignIn, sendEmailSignInLink, type SignInResult } from "@/lib/auth/sign-in";
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
const EMAIL_LABEL: LocalizedText = { en: "Email", fil: "Email" };
const EMAIL_SIGN_IN_LINK: LocalizedText = { en: "Email me a sign-in link", fil: "Ipadala sa akin ang link sa pag-sign in" };
const CHECK_YOUR_EMAIL: LocalizedText = {
  en: "Check your email for a sign-in link.",
  fil: "Tingnan ang iyong email para sa link sa pag-sign in.",
};
const FAILED_NOTICE: LocalizedText = {
  en: "That didn't work. If this Google account is already used on another phone, sign in to that account instead.",
  fil: "Hindi ito gumana. Kung ang Google account na ito ay ginagamit na sa ibang telepono, mag-sign in na lang doon.",
};
const SIGN_IN_EXISTING: LocalizedText = {
  en: "Sign in to my existing account",
  fil: "Mag-sign in sa aking umiiral na account",
};

type Control = "google" | "email" | "existing";

export function SignInPanel({ next, notice }: { next: string; notice?: string }) {
  const { lang } = useLanguage();
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
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
      return;
    }
    if (control === "email") setEmailSent(true);
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

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleResult("email", () => sendEmailSignInLink(email, next));
          }}
        >
          <Label htmlFor="sign-in-email">{t(EMAIL_LABEL, lang)}</Label>
          <Input
            id="sign-in-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending === "email"}
          />
          <Button type="submit" variant="outline" size="lg" className="w-full" disabled={pending === "email"}>
            {t(EMAIL_SIGN_IN_LINK, lang)}
          </Button>
          {errors.email && (
            <p role="alert" className="text-sm text-destructive">
              {errors.email}
            </p>
          )}
          {emailSent && (
            <p role="status" lang={lang} className="text-sm text-green-500">
              {t(CHECK_YOUR_EMAIL, lang)}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
