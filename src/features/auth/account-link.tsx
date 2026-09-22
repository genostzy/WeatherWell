"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getBrowserClient } from "@/lib/supabase/browser";
import { isAdminPath } from "@/lib/auth/admin-path";
import type { LocalizedText } from "@/lib/types";

const KEEP_REPORTS: LocalizedText = {
  en: "Keep your reports on a new phone",
  fil: "Panatilihin ang iyong mga ulat sa bagong telepono",
};
const SIGN_IN: LocalizedText = { en: "Sign in", fil: "Mag-sign in" };
const SIGN_OUT: LocalizedText = { en: "Sign out", fil: "Mag-sign out" };
const ON_THIS_DEVICE: LocalizedText = {
  en: "Saved on this device",
  fil: "Nakatago sa device na ito",
};
const SIGNED_IN_LABEL: LocalizedText = { en: "Signed in", fil: "Naka-sign in" };

type SessionKind = "none" | "anonymous" | "permanent";

function kindOf(session: { user: { is_anonymous?: boolean } } | null | undefined): SessionKind {
  if (!session) return "none";
  return session.user.is_anonymous ? "anonymous" : "permanent";
}

/**
 * Mounted once, in the root layout's header, beside <LanguageToggle /> — so
 * it renders on every page for every visitor, signed in or not, including
 * the homepage. That makes it display-only by construction: it reads
 * getSession() purely to decide what to show, the same exception
 * useSessionUserId documents, and it must NEVER call ensureAnonymousSession
 * or signInAnonymously. A visitor who has never written has no session and
 * nothing to keep, and mounting this component must not be what signs them
 * in — only their own first write does that. It still always shows a status
 * ("Saved on this device" here, same as an anonymous visitor who has written
 * something) — having no session is a fact about the visitor, not a reason
 * to hide it.
 *
 * Renders nothing on /admin routes: admin-header.tsx already has its own
 * sign-out, and an official would otherwise see two.
 */
export function AccountLink() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const [kind, setKind] = useState<SessionKind>("none");
  const isAdmin = isAdminPath(pathname);

  useEffect(() => {
    if (isAdmin) return;

    let active = true;
    const supabase = getBrowserClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setKind(kindOf(data.session));
    });

    // Sign-in happens on the first WRITE, which is after this mount — so
    // without subscribing, a resident who signs in on another tab (or whose
    // anonymous session is upgraded via /sign-in) would keep the stale
    // "none"/"anonymous" kind here until they reload. Subscribing signs
    // nobody in; it only listens.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setKind(kindOf(session));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [isAdmin]);

  if (isAdmin) return null;

  if (kind === "permanent") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{t(SIGNED_IN_LABEL, lang)}</span>
        <form method="post" action="/auth/signout">
          <input type="hidden" name="next" value={pathname} />
          <Button type="submit" variant="ghost" size="sm">
            {t(SIGN_OUT, lang)}
          </Button>
        </form>
      </div>
    );
  }

  // "none" and "anonymous" both read the same way to a resident — the
  // difference (never written vs. written-but-not-linked-to-an-account) is
  // an implementation detail. Only the sign-in link's own label changes:
  // there's nothing to "keep" yet for a visitor who has never written.
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t(ON_THIS_DEVICE, lang)}</span>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>
          {t(kind === "anonymous" ? KEEP_REPORTS : SIGN_IN, lang)}
        </Link>
      </Button>
    </div>
  );
}
