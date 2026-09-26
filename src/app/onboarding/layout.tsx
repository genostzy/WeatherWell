import type { Metadata } from "next";

// The page is a client component, which can't export metadata (WCAG 2.4.2).
export const metadata: Metadata = { title: "Getting started" };

export default function GettingStartedLayout({ children }: LayoutProps<"/onboarding">) {
  return children;
}
