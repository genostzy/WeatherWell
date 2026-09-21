"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrowserClient } from "@/lib/supabase/browser";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Settings", fil: "Mga Setting" };
const ACCOUNT: LocalizedText = { en: "Account", fil: "Account" };
const SIGNED_IN_AS: LocalizedText = { en: "Signed in as", fil: "Naka-sign in bilang" };
const SIGNED_IN_ANONYMOUSLY: LocalizedText = {
  en: "Signed in anonymously",
  fil: "Naka-sign in nang hindi nagpapakilala",
};
const SIGN_OUT: LocalizedText = { en: "Sign out", fil: "Mag-sign out" };

export default function ResidentSettingsPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
    });
  }, []);

  async function handleSignOut() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t(TITLE, lang)}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t(ACCOUNT, lang)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {email ? `${t(SIGNED_IN_AS, lang)} ${email}` : t(SIGNED_IN_ANONYMOUSLY, lang)}
          </p>
          <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
            {t(SIGN_OUT, lang)}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
