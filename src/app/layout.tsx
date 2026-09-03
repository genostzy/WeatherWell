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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <TooltipProvider>
          <LanguageProvider>
            <ServiceWorkerRegistration />
            <header className="flex items-center justify-between p-3">
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
