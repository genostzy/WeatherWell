"use client";

/**
 * A small line/area chart drawn as plain SVG. No charting library: this app
 * ships to low-end phones on degraded connections, and a whole chart runtime
 * for four sparklines would cost more than it's worth. Everything here is
 * paths computed from the series.
 */
export function TrendChart({
  series,
  color,
  label,
  unit = "",
  height = 64,
}: {
  series: number[];
  color: string;
  /** Screen-reader description — the chart itself is a single role="img". */
  label: string;
  unit?: string;
  height?: number;
}) {
  if (series.length < 2) return null;

  const width = 240;
  const paddingY = 6;
  const max = Math.max(...series);
  const min = Math.min(...series);
  // A flat series would divide by zero; give it a nominal range so it renders
  // as a centred straight line instead of collapsing onto the top edge.
  const range = max - min || 1;
  const stepX = width / (series.length - 1);

  const points = series.map((value, index) => {
    const x = index * stepX;
    const y = paddingY + (1 - (value - min) / range) * (height - paddingY * 2);
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width} ${height} L0 ${height} Z`;
  const last = points[points.length - 1];
  const latest = series[series.length - 1];
  const first = series[0];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-16 w-full"
      role="img"
      // Deliberately describes the shape rather than naming a direction: a
      // series that peaks mid-way and falls back would be called "rising" by
      // a first-vs-last comparison, which is the opposite of what it shows.
      aria-label={`${label}: starts at ${first}${unit}, now ${latest}${unit}. Peak ${max}${unit}, low ${min}${unit}.`}
    >
      <path d={areaPath} fill={color} opacity={0.18} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r={3} fill={color} />
    </svg>
  );
}
