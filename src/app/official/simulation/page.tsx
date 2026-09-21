import { loadOfficial } from "@/lib/auth/load-official";
import { redirect } from "next/navigation";

export default async function OfficialSimulationPage() {
  const gate = await loadOfficial();
  if (gate.state !== "official") redirect("/sign-in?next=/official");
  
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Drill Mode</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Practice issuing alerts and coordinating evacuations without notifying anyone.
      </p>
      <div className="rounded-xl border-2 border-border overflow-hidden">
        <iframe
          src="/admin/simulation"
          className="w-full h-[600px] border-0"
          title="Drill Mode"
        />
      </div>
    </div>
  );
}
