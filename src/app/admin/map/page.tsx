"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { MOCK_ZONES } from "@/lib/mock-data";
import type { LocalizedText } from "@/lib/types";

/** Leaflet is browser-only, same constraint as the resident map — see homepage-map.tsx. */
const AdminMapCanvas = dynamic(
  () => import("@/features/admin/admin-map-canvas").then((m) => m.AdminMapCanvas),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[340px] w-full rounded-md sm:h-[400px] lg:h-[600px]" />,
  }
);

const BACK_TO_DASHBOARD: LocalizedText = { en: "Back to admin dashboard", fil: "Balik sa admin dashboard" };
const PAGE_TITLE: LocalizedText = { en: "Operations Map", fil: "Mapa ng Operasyon" };
const SUBTITLE: LocalizedText = {
  en: "Every zone at once — override an alert, log a headcount, or moderate a pin where it actually sits",
  fil: "Lahat ng zone nang sabay — baguhin ang alerto, itala ang bilang, o pamahalaan ang pin kung saan ito naroon",
};
const NOTE: LocalizedText = {
  en: "Edits here write to the same place the dashboard panels do, and residents see them immediately.",
  fil: "Ang mga pagbabago dito ay pareho ng sa dashboard panels, at agad makikita ng mga residente.",
};

export default function AdminMapPage() {
  const { lang } = useLanguage();

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl space-y-4 lg:max-w-5xl">
        <Button asChild variant="ghost" size="lg">
          <Link href="/admin">
            <ArrowLeft aria-hidden="true" />
            {t(BACK_TO_DASHBOARD, lang)}
          </Link>
        </Button>

        <div>
          <h1 className="text-2xl font-bold">{t(PAGE_TITLE, lang)}</h1>
          <p lang={lang} className="text-muted-foreground">
            {t(SUBTITLE, lang)}
          </p>
        </div>

        <AdminMapCanvas zones={MOCK_ZONES} />

        <p lang={lang} className="text-xs text-muted-foreground">
          {t(NOTE, lang)}
        </p>
      </div>
    </main>
  );
}
