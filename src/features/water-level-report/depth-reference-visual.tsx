"use client";

import { useId } from "react";
import {
  DEPTH_CM,
  DEPTH_LABEL,
  DEPTH_SEVERITY,
  depthFillPercent,
  type DepthLevel,
} from "@/lib/depth";
import { SEVERITY_HEX } from "@/lib/severity";

export const ADULT_HEIGHT_CM = 170;
export const CHILD_HEIGHT_CM = 110;

/** The scene is drawn at exactly 1 SVG unit per centimetre. */
const GROUND_Y = 180;
const SCENE_WIDTH = 200;
const SCENE_HEIGHT = 190;
const ADULT_CENTER_X = 62;
const CHILD_CENTER_X = 142;

interface FigureProps {
  who: "adult" | "child";
  label: string;
  heightCm: number;
  centerX: number;
  depthCm: number;
  color: string;
  clipId: string;
}

function Figure({
  who,
  label,
  heightCm,
  centerX,
  depthCm,
  color,
  clipId,
}: FigureProps) {
  const topY = GROUND_Y - heightCm;
  const headRadius = heightCm * 0.09;
  const bodyWidth = heightCm * 0.24;
  const bodyX = centerX - bodyWidth / 2;
  const bodyTopY = topY + headRadius * 2;

  // How much of *this* figure the water covers, in centimetres (= SVG units).
  // Rounded to 2dp: the percent round-trip is lossy in binary floating point
  // (15cm on a 170cm figure comes back as 15.000000000000002).
  const submergedCm =
    Math.round((depthFillPercent(depthCm, heightCm) / 100) * heightCm * 100) / 100;

  return (
    <g role="img" aria-label={label}>
      <defs>
        <clipPath id={clipId}>
          <circle cx={centerX} cy={topY + headRadius} r={headRadius} />
          <rect
            x={bodyX}
            y={bodyTopY}
            width={bodyWidth}
            height={GROUND_Y - bodyTopY}
            rx={bodyWidth / 2}
          />
        </clipPath>
      </defs>

      {/* Silhouette outline */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          data-testid={`${who}-body`}
          data-height-cm={heightCm}
          x={centerX - bodyWidth}
          y={topY}
          width={bodyWidth * 2}
          height={heightCm}
          fill="currentColor"
          opacity={0.28}
        />
        {/* Water covering this figure, measured from the shared ground line */}
        <rect
          data-testid={`${who}-fill`}
          x={centerX - bodyWidth}
          y={GROUND_Y - submergedCm}
          width={bodyWidth * 2}
          height={submergedCm}
          fill={color}
        />
      </g>
    </g>
  );
}

export function DepthReferenceVisual({ depthLevel }: { depthLevel: DepthLevel }) {
  // useId() emits punctuation that is not safe inside a url(#...) fragment
  // reference, so strip everything except word characters and dashes.
  const baseId = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const depthCm = DEPTH_CM[depthLevel];
  const color = SEVERITY_HEX[DEPTH_SEVERITY[depthLevel]];
  const waterY = GROUND_Y - depthCm;

  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
        className="h-48 w-auto text-foreground"
      >
        <Figure
          who="adult"
          label="Adult reference figure"
          heightCm={ADULT_HEIGHT_CM}
          centerX={ADULT_CENTER_X}
          depthCm={depthCm}
          color={color}
          clipId={`${baseId}-adult`}
        />
        <Figure
          who="child"
          label="Child reference figure"
          heightCm={CHILD_HEIGHT_CM}
          centerX={CHILD_CENTER_X}
          depthCm={depthCm}
          color={color}
          clipId={`${baseId}-child`}
        />

        {/* One waterline across the whole scene — the shared reference */}
        {depthCm > 0 && (
          <line
            data-testid="waterline"
            x1={0}
            y1={waterY}
            x2={SCENE_WIDTH}
            y2={waterY}
            stroke={color}
            strokeWidth={3}
          />
        )}
        {depthCm === 0 && (
          <line
            data-testid="waterline"
            x1={0}
            y1={GROUND_Y}
            x2={SCENE_WIDTH}
            y2={GROUND_Y}
            stroke="currentColor"
            strokeWidth={2}
            opacity={0.4}
          />
        )}

        {/* Ground line */}
        <line
          x1={0}
          y1={GROUND_Y}
          x2={SCENE_WIDTH}
          y2={GROUND_Y}
          stroke="currentColor"
          strokeWidth={2}
        />
      </svg>
      <figcaption className="text-base font-medium">{DEPTH_LABEL[depthLevel]}</figcaption>
    </figure>
  );
}
