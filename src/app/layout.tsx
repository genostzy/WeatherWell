import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { LanguageToggle } from "@/features/i18n/language-toggle";
import { OutboxBadge } from "@/features/outbox/outbox-badge";
import { AccountLink } from "@/features/auth/account-link";
import { ErrorReporter } from "@/features/monitoring/error-reporter";
import { SelectedZoneHotlineButton } from "@/components/selected-zone-hotline-button";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { OutboxDrain } from "@/components/outbox-drain";
import { RetiredStorageSweep } from "@/components/retired-storage-sweep";
import { ReferenceDataProvider } from "@/lib/reference-data/provider";

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export const metadata: Metadata = {
  title: "WeatherWell",
  description: "Offline-capable flood alerts and evacuation guidance.",
  manifest: "/manifest.json",
  // iOS Safari ignores the Web App Manifest's icons for "Add to Home
  // Screen" — it needs an explicit apple-touch-icon link, which this
  // generates. The browser-tab favicon itself comes from src/app/favicon.ico
  // (Next.js's file convention) — that file now holds the same WeatherWell
  // icon, replacing the framework's default placeholder; declaring `icon`
  // here too would just add a second, competing <link rel="icon">.
  icons: {
    apple: "/icon-192.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <TooltipProvider>
          <LanguageProvider>
            <ServiceWorkerRegistration />
            <OutboxDrain />
            <RetiredStorageSweep />
            <ReferenceDataProvider
              chrome={
                <header className="flex items-center justify-center gap-4 p-3">
                  <span className="font-semibold">WeatherWell</span>
                  <LanguageToggle />
                  <OutboxBadge />
                  <AccountLink />
                  <ErrorReporter />
                </header>
              }
            >
              {children}
              <SelectedZoneHotlineButton />
            </ReferenceDataProvider>
          </LanguageProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
