"use client";

import Link from "next/link";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { LocalizedText } from "@/lib/types";

const NOT_APPOINTED_MESSAGE: LocalizedText = {
  en: "You're signed in, but you haven't been appointed as an official yet. Send this email address to the system owner:",
  fil: "Naka-sign in ka na, pero hindi ka pa itinalaga bilang opisyal. Ipadala ang email address na ito sa may-ari ng sistema:",
};
const SIGN_IN_FIRST: LocalizedText = {
  en: "Sign in with your own account first",
  fil: "Mag-sign in muna gamit ang sarili mong account",
};
const SIGN_IN_LINK: LocalizedText = { en: "Sign in", fil: "Mag-sign in" };
const SIGN_OUT: LocalizedText = { en: "Sign out", fil: "Mag-sign out" };

/**
 * Shown by the /admin layout when the visitor is signed in but their
 * public.profiles row is not an appointed operator — either a resident
 * account nobody has appointed yet, or an anonymous session (no email to
 * hand the system owner, so it points back to sign-in instead).
 *
 * Sign out is offered in both cases (M10): someone who picked the wrong
 * Google account, or an official who was removed, otherwise has no way off
 * this screen, since AccountLink is hidden across /admin. Same real form POST
 * as AdminHeader, so it works without JS and matches /auth/signout's
 * POST-only guard.
 */
export function NotAppointed({ email }: { email: string | null }) {
  const { lang } = useLanguage();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      {email ? (
        <p lang={lang} className="max-w-md">
          {t(NOT_APPOINTED_MESSAGE, lang)} <strong>{email}</strong>
        </p>
      ) : (
        <>
          <p lang={lang} className="max-w-md">
            {t(SIGN_IN_FIRST, lang)}
          </p>
          <Link href="/sign-in?next=/admin" className="text-primary underline underline-offset-4">
            {t(SIGN_IN_LINK, lang)}
          </Link>
        </>
      )}
      <form method="post" action="/auth/signout">
        <input type="hidden" name="next" value="/" />
        <Button type="submit" variant="outline" size="sm">
          {t(SIGN_OUT, lang)}
        </Button>
      </form>
    </main>
  );
}
