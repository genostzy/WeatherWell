import type { Metadata } from "next";

// The page is a client component, which can't export metadata (WCAG 2.4.2).
export const metadata: Metadata = { title: "Operations map" };

export default function OperationsMapLayout({ children }: LayoutProps<"/admin/map">) {
  return children;
}
