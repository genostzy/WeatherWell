import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { LanguageToggle } from "@/features/i18n/language-toggle";
import { EmergencyHotlineButton } from "@/components/emergency-hotline-button";
import { MOCK_ZONES } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "WeatherWell",
  description: "Offline-capable flood alerts and evacuation guidance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <LanguageProvider>
          <header className="flex justify-end p-3">
            <LanguageToggle />
          </header>
          {children}
          <EmergencyHotlineButton hotlineNumber={MOCK_ZONES[0].hotlineNumber} />
        </LanguageProvider>
      </body>
    </html>
  );
}
