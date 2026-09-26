import type { Metadata } from "next";

// The page is a client component, which can't export metadata (WCAG 2.4.2).
export const metadata: Metadata = { title: "Barangay details" };

export default function BarangayDetailsLayout({ children }: LayoutProps<"/admin/zone/[zoneId]">) {
  return children;
}
