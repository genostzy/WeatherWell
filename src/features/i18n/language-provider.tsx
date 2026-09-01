"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
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
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
