import type { Metadata } from "next";

// The page is a client component, which can't export metadata (WCAG 2.4.2).
export const metadata: Metadata = { title: "Report water level" };

export default function ReportWaterLevelLayout({ children }: LayoutProps<"/report">) {
  return children;
}
