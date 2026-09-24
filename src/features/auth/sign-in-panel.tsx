"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { startGoogleSignIn, signInWithPassword, signUpWithPassword, type SignInResult } from "@/lib/auth/sign-in";
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
const PASSWORD_LABEL: LocalizedText = { en: "Password", fil: "Password" };
const FAILED_NOTICE: LocalizedText = {
  en: "That didn't work. If this Google account is already used on another phone, sign in to that account instead.",
  fil: "Hindi ito gumana. Kung ang Google account na ito ay ginagamit na sa ibang telepono, mag-sign in na lang doon.",
};
const SIGN_IN_EXISTING: LocalizedText = {
  en: "Sign in to your existing account",
  fil: "Mag-sign in sa iyong umiiral na account",
};
const SIGN_IN_BTN: LocalizedText = { en: "Sign in", fil: "Mag-sign in" };
const CREATE_ACCOUNT: LocalizedText = { en: "Create account", fil: "Lumikha ng account" };
const ACCOUNT_CREATED: LocalizedText = {
  en: "Account created! Check your email to confirm, then sign in.",
  fil: "Nalikha ang account! I-confirm sa email, pagkatapos mag-sign in.",
};
const NO_ACCOUNT: LocalizedText = { en: "Don't have an account?", fil: "Wala pang account?" };
const HAVE_ACCOUNT: LocalizedText = { en: "Already have an account?", fil: "May account na?" };
const CONTINUE_WITHOUT_ACCOUNT: LocalizedText = {
  en: "Continue — no account needed",
  fil: "Magpatuloy — hindi kailangan ng account",
};

type Control = "google" | "existing" | "password";

export function SignInPanel({ next, notice }: { next: string; notice?: string }) {
  const { lang } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
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
    if (control === "password") {
      if (isSignUp) {
        // signUpWithPassword may still need an email-confirmation click
        // before the session is live (Supabase project setting), so this
        // stays on the page and tells the resident to sign in once
        // confirmed, the same as the email-link flow's "check your email".
        setAccountCreated(true);
      } else {
        // Google leaves the page itself (an OAuth redirect); password
        // sign-in resolves in place, so this is the only control that has
        // to navigate itself.
        router.push(next);
        router.refresh();
      }
    }
    // "google"/"existing" leave the page themselves on success (an OAuth
    // redirect), so there is nothing left to do here for them.
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
              loading={pending === "existing"}
              onClick={() => handleResult("existing", () => startGoogleSignIn(next, { link: false }))}
            >
              {t(SIGN_IN_EXISTING, lang)}
            </Button>
            {errors.existing && (
              <p role="alert" className="text-sm text-destructive">
                {friendlyError(errors.existing, lang)}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            loading={pending === "google"}
            onClick={() => handleResult("google", () => startGoogleSignIn(next))}
          >
            {t(CONTINUE_WITH_GOOGLE, lang)}
          </Button>
          {errors.google && (
            <p role="alert" className="text-sm text-destructive">
              {friendlyError(errors.google, lang)}
            </p>
          )}
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const run = isSignUp
              ? () => signUpWithPassword(email, password)
              : () => signInWithPassword(email, password);
            void handleResult("password", run);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="sign-in-email">{t(EMAIL_LABEL, lang)}</Label>
            <Input
              id="sign-in-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending === "password"}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sign-in-password">{t(PASSWORD_LABEL, lang)}</Label>
            <Input
              id="sign-in-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending === "password"}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" loading={pending === "password"}>
            {isSignUp ? t(CREATE_ACCOUNT, lang) : t(SIGN_IN_BTN, lang)}
          </Button>
          {errors.password && (
            <p role="alert" className="text-sm text-destructive">
              {friendlyError(errors.password, lang)}
            </p>
          )}
          {accountCreated && (
            <p role="status" lang={lang} className="text-sm text-green-500">
              {t(ACCOUNT_CREATED, lang)}
            </p>
          )}
          <p className="text-center text-xs text-muted-foreground">
            {isSignUp ? t(HAVE_ACCOUNT, lang) : t(NO_ACCOUNT, lang)}{" "}
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrors({});
                setAccountCreated(false);
              }}
            >
              {isSignUp ? t(SIGN_IN_BTN, lang) : t(CREATE_ACCOUNT, lang)}
            </button>
          </p>
        </form>

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
