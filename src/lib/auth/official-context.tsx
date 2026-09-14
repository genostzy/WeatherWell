"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Official } from "./official";

export const OfficialContext = createContext<Official | null>(null);

export function OfficialProvider({ official, children }: { official: Official; children: ReactNode }) {
  return <OfficialContext.Provider value={official}>{children}</OfficialContext.Provider>;
}

/** The signed-in official. Only mounted inside the /admin gate; in tests use renderWithData. */
export function useOfficial(): Official {
  const official = useContext(OfficialContext);
  if (!official) {
    throw new Error("useOfficial requires the /admin layout's OfficialProvider. In tests, use renderWithData.");
  }
  return official;
}
