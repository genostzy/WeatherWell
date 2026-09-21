import { loadOfficial } from "@/lib/auth/load-official";
import { redirect } from "next/navigation";

export default async function OfficialHistoryPage() {
  const gate = await loadOfficial();
  if (gate.state !== "official") redirect("/sign-in?next=/official");
  
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Action History</h1>
      <div className="rounded-xl border-2 border-border overflow-hidden">
        <iframe
          src="/admin/history"
          className="w-full h-[600px] border-0"
          title="Action History"
        />
      </div>
    </div>
  );
}
