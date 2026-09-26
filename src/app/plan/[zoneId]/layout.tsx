import type { Metadata } from "next";

// The page is a client component, which can't export metadata (WCAG 2.4.2).
export const metadata: Metadata = { title: "Flood plan" };

export default function FloodPlanLayout({ children }: LayoutProps<"/plan/[zoneId]">) {
  return children;
}
