import { redirect } from "next/navigation";
import { loadOfficial } from "@/lib/auth/load-official";
import { OfficialProvider } from "@/lib/auth/official-context";
import { AdminHeader } from "@/features/admin/admin-header";
import { NotAppointed } from "@/features/admin/not-appointed";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const gate = await loadOfficial();
  if (gate.state === "signed-out") redirect("/sign-in?next=/admin");
  if (gate.state === "not-appointed") return <NotAppointed email={gate.email} />;
  return (
    <OfficialProvider official={gate.official}>
      <AdminHeader />
      {children}
    </OfficialProvider>
  );
}
