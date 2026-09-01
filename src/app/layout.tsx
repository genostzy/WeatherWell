import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { LanguageToggle } from "@/features/i18n/language-toggle";
import { SelectedZoneHotlineButton } from "@/components/selected-zone-hotline-button";

export const metadata: Metadata = {
  title: "WeatherWell",
  description: "Offline-capable flood alerts and evacuation guidance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <TooltipProvider>
          <LanguageProvider>
            <header className="flex justify-end p-3">
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
