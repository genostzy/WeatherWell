"use client";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Composition at a glance (e.g. how many evacuation centers still have space).
 * Drawn with stroke-dasharray on concentric circle arcs — no library, and it
 * scales cleanly on a cheap phone screen.
 */
export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  label,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  label: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  // Each arc starts where the previous one ended, so this accumulates the
  // running offset immutably rather than mutating a variable during render.
  const arcs = segments
    .filter((segment) => segment.value > 0)
    .reduce<{ label: string; color: string; dash: number; gap: number; offset: number }[]>(
      (drawn, segment) => {
        const consumed = drawn.reduce((sum, arc) => sum + arc.dash, 0);
        const dash = (total > 0 ? segment.value / total : 0) * circumference;
        return [
          ...drawn,
          {
            label: segment.label,
            color: segment.color,
            dash,
            gap: circumference - dash,
            // Negative: SVG circles start drawing at 3 o'clock.
            offset: -consumed,
          },
        ];
      },
      []
    );

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 100 100"
        className="h-28 w-28 shrink-0 -rotate-90"
        role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.value} ${s.label}`).join(", ")}.`}
      >
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="12" className="text-muted" />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth="12"
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            strokeDashoffset={arc.offset}
          />
        ))}
      </svg>
      <div className="min-w-0 space-y-1">
        <p className="text-2xl font-bold tabular-nums">{centerValue}</p>
        <p className="text-xs text-muted-foreground">{centerLabel}</p>
        <ul className="space-y-0.5 pt-1">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: segment.color }}
              />
              <span className="truncate">
                {segment.label} · <span className="tabular-nums">{segment.value}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
