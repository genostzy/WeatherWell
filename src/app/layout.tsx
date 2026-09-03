import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { LanguageToggle } from "@/features/i18n/language-toggle";
import { SelectedZoneHotlineButton } from "@/components/selected-zone-hotline-button";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

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
            <header className="flex items-center justify-center gap-4 p-3">
              <span className="font-semibold">WeatherWell</span>
              <LanguageToggle />
            </header>
            {children}
            <SelectedZoneHotlineButton />
          </LanguageProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
