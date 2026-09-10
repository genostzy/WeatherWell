"use client";

import { useEffect } from "react";
import { clearRetiredStorage } from "@/lib/retired-storage";

/**
 * Mounts the retired-storage sweep once per app load. A tiny wrapper rather
 * than calling clearRetiredStorage() straight from RootLayout: RootLayout is
 * a server component, and localStorage only exists in the browser.
 */
export function RetiredStorageSweep() {
  useEffect(() => {
    clearRetiredStorage();
  }, []);
  return null;
}
