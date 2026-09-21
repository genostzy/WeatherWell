import { redirect } from "next/navigation";
import Link from "next/link";
import { loadOfficial } from "@/lib/auth/load-official";
import { OfficialProvider } from "@/lib/auth/official-context";
import { AdminHeader } from "@/features/admin/admin-header";
import { NotAppointed } from "@/features/admin/not-appointed";

export default async function OfficialLayout({ children }: LayoutProps<"/official">) {
  const gate = await loadOfficial();
  if (gate.state === "signed-out") redirect("/sign-in?next=/official");
  if (gate.state === "not-appointed") return <NotAppointed email={gate.email} />;

  const tabs = [
    { href: "/official", label: "Overview" },
    { href: "/official/map", label: "Map" },
    { href: "/official/zones", label: "Zones" },
    { href: "/official/history", label: "History" },
    { href: "/official/simulation", label: "Simulation" },
  ];

  return (
    <OfficialProvider official={gate.official}>
      <AdminHeader />
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
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
    </OfficialProvider>
  );
}
