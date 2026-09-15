"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring/report";

/**
 * Last resort, when the root layout itself fails. It replaces the whole
 * document, so it has no LanguageProvider and no global styles: it states the
 * message in both languages with inline styles.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    void reportError(error, { source: "client", kind: "render", route: window.location.pathname });
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <p role="alert">Something went wrong loading WeatherWell. Please try again.</p>
        <p lang="fil">May naganap na problema sa pag-load ng WeatherWell. Pakisubukang muli.</p>
        <button type="button" onClick={retry} style={{ padding: "8px 16px", marginTop: 12 }}>
          Try again · Subukang muli
        </button>
      </body>
    </html>
  );
}
