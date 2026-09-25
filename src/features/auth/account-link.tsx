"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getBrowserClient } from "@/lib/supabase/browser";
import { isAdminPath } from "@/lib/auth/admin-path";
import { useOfficialRole } from "@/lib/auth/use-official-role";
import { RoleBadge } from "./role-badge";
import type { LocalizedText } from "@/lib/types";

// Says what the link does and that it is optional (owner's request): a
// guest's reports already work without it.
const KEEP_REPORTS: LocalizedText = { en: "Back up reports (sign in)", fil: "I-back up ang ulat (mag-sign in)" };
const SIGN_IN: LocalizedText = { en: "Sign in (optional)", fil: "Mag-sign in (opsyonal)" };
const SIGN_OUT: LocalizedText = { en: "Sign out", fil: "Mag-sign out" };
const ON_THIS_DEVICE: LocalizedText = {
  en: "Saved on this device",
  fil: "Nakatago sa device na ito",
};
const DASHBOARD: LocalizedText = { en: "Dashboard", fil: "Dashboard" };
const ACCOUNT: LocalizedText = { en: "Account", fil: "Account" };

/**
 * The badge opens a small menu with the account's actions, so the top bar
 * fits one row on a phone (owner's request). A native <details>: keyboard
 * and screen-reader support for free; it closes on a tap outside or on
 * choosing an action.
 */
function AccountMenu({ label, badge, children }: { label: string; badge: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(event: PointerEvent) {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={label}
        className="flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
      >
        {badge}
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      </summary>
      <div
        onClick={() => {
          if (ref.current) ref.current.open = false;
        }}
        className="absolute right-0 top-full z-[1100] mt-2 flex w-56 flex-col gap-1 rounded-xl border-2 border-border bg-background p-2 shadow-lg"
      >
        {children}
      </div>
    </details>
  );
}

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
  const officialRole = useOfficialRole();

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

  const menuLabel = (name: string) => `${t(ACCOUNT, lang)}: ${name}`;

  if (kind === "permanent") {
    return (
      <AccountMenu
        label={menuLabel(officialRole ? officialRole.level : "resident")}
        badge={<RoleBadge kind={officialRole?.level ?? "resident"} />}
      >
        {officialRole && (
          <Button asChild variant="secondary" className="h-10 w-full justify-start">
            <Link href="/admin">{t(DASHBOARD, lang)}</Link>
          </Button>
        )}
        <form method="post" action="/auth/signout">
          <input type="hidden" name="next" value={pathname} />
          <Button type="submit" variant="ghost" className="h-10 w-full justify-start">
            {t(SIGN_OUT, lang)}
          </Button>
        </form>
      </AccountMenu>
    );
  }

  // "none" and "anonymous" both read the same way to a resident — the
  // difference (never written vs. written-but-not-linked-to-an-account) is
  // an implementation detail. Only the sign-in link's own label changes:
  // there's nothing to "keep" yet for a visitor who has never written.
  return (
    <AccountMenu label={menuLabel("guest")} badge={<RoleBadge kind="guest" />}>
      <p lang={lang} className="px-2 py-1 text-xs text-muted-foreground">
        {t(ON_THIS_DEVICE, lang)}
      </p>
      <Button asChild variant="secondary" className="h-10 w-full justify-start">
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>
          {t(kind === "anonymous" ? KEEP_REPORTS : SIGN_IN, lang)}
        </Link>
      </Button>
    </AccountMenu>
  );
}
