import type { Metadata } from "next";

// The page is a client component, which can't export metadata (WCAG 2.4.2).
export const metadata: Metadata = { title: "Alert flow simulation" };

export default function AlertFlowSimulationLayout({ children }: LayoutProps<"/admin/simulation">) {
  return children;
}
