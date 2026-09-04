import type { ZoneStatus } from "@/lib/zone-status";

/**
 * CSS for the shape (not color) that differentiates each zone status —
 * shared between the map markers (marker-icons.ts) and the legend
 * (marker-legend.tsx) so they can't drift apart.
 */
export const STATUS_SHAPE_STYLE: Record<ZoneStatus, string> = {
  safe: "border-radius: 50%;", // circle
  cautionary: "clip-path: polygon(50% 0%, 0% 100%, 100% 100%);", // triangle
  dangerous: "transform: rotate(45deg);", // diamond
  hazardous:
    "clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);", // octagon
};
