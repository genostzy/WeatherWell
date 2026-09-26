"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LanguageCode } from "@/lib/types";

interface LanguageContextValue {
  lang: LanguageCode;
  setLang: (lang: LanguageCode) => void;
}

/** Defaults to English so components render standalone (and in tests) without a provider. */
const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
});

export function LanguageProvider({
  children,
  initialLang = "en",
}: {
  children: ReactNode;
  initialLang?: LanguageCode;
}) {
  const [lang, setLang] = useState<LanguageCode>(initialLang);
  // The page's own language follows the toggle (WCAG 3.1.1): a screen reader
  // then speaks untagged text in the language it is written in.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
