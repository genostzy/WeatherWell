import { redirect } from "next/navigation";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { ResidentNav } from "@/features/resident/resident-nav";

export default async function ResidentLayout({ children }: LayoutProps<"/resident">) {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/sign-in?next=/resident");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <ResidentNav />
      {children}
    </div>
  );
}
