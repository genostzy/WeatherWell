import { loadOfficial } from "@/lib/auth/load-official";
import { redirect } from "next/navigation";

export default async function OfficialMapPage() {
  const gate = await loadOfficial();
  if (gate.state !== "official") redirect("/sign-in?next=/official");
  
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Operations Map</h1>
      <p className="text-sm text-muted-foreground mb-4">
        View and manage alerts, evacuation centers, and community pins across your area.
      </p>
      <div className="rounded-xl border-2 border-border overflow-hidden">
        <iframe
          src="/admin/map"
          className="w-full h-[600px] border-0"
          title="Operations Map"
        />
      </div>
    </div>
  );
}
