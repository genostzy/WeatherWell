"use client";

export interface BarDatum {
  label: string;
  value: number;
  color: string;
  /** Optional second value drawn as a darker inset — e.g. how many of a zone's alerts were later downgraded. */
  subValue?: number;
  subLabel?: string;
}

/**
 * Horizontal bars, drawn with plain divs rather than SVG so the labels stay
 * real text (selectable, translatable, and readable by a screen reader in
 * document order) instead of becoming SVG <text> the browser can't reflow.
 */
export function BarChart({
  data,
  unit = "",
  maxValue,
}: {
  data: BarDatum[];
  unit?: string;
  /** Pin the scale across several charts; defaults to this chart's own peak. */
  maxValue?: number;
}) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((datum) => {
        const widthPercent = (datum.value / max) * 100;
        const subWidthPercent = datum.subValue ? (datum.subValue / max) * 100 : 0;
        return (
          <div key={datum.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{datum.label}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {datum.value}
                {unit}
                {datum.subValue !== undefined && datum.subLabel && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({datum.subValue} {datum.subLabel})
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-sm bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${widthPercent}%`, backgroundColor: datum.color }}
              />
              {subWidthPercent > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-sm bg-foreground/40"
                  style={{ width: `${subWidthPercent}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
