"use client";

import type { ComponentType } from "react";
import { Card, CardContent } from "@/components/ui/card";

/** One headline number for the top of the admin dashboard — the reading an operator should catch without reading a panel. */
export function StatCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  accentClass = "text-foreground",
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  accentClass?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon aria-hidden className="h-4 w-4" />
          <span className="truncate">{label}</span>
        </div>
        <p className={`text-2xl font-bold tabular-nums ${accentClass}`}>
          {value}
          {unit && <span className="ml-0.5 text-base font-medium">{unit}</span>}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
