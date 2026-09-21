import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";

export default async function ResidentLayout({ children }: LayoutProps<"/resident">) {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/sign-in?next=/resident");

  const tabs = [
    { href: "/resident", label: "Overview" },
    { href: "/resident/reports", label: "Reports" },
    { href: "/resident/check-ins", label: "Check-ins" },
    { href: "/resident/pins", label: "Pins" },
    { href: "/resident/settings", label: "Settings" },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border pb-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
