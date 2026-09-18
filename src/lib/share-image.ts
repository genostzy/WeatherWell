"use client";

import { useRef, useCallback } from "react";
import { SEVERITY_HEX, SEVERITY_TEXT_HEX, SEVERITY_LABEL } from "@/lib/severity";
import type { Severity } from "@/lib/severity";
import type { LocalizedText } from "@/lib/types";

const WIDTH = 600;
const HEIGHT = 315;

/**
 * Generates a shareable alert image on a canvas element.
 * The image includes: severity color bar, zone name, alert message,
 * evacuation center, and WeatherWell branding.
 * Returns a Blob for download or sharing.
 */
export async function generateAlertImage(options: {
  severity: Severity;
  zoneName: string;
  message: string;
  evacuationCenter: string;
  lang: "en" | "fil";
}): Promise<Blob | null> {
  const { severity, zoneName, message, evacuationCenter, lang } = options;

  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const bgColor = "#0a0a0a";
  const textColor = "#e5e5e5";
  const mutedColor = "#a3a3a3";
  const severityColor = SEVERITY_HEX[severity];

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Severity accent bar (left side, full height)
  ctx.fillStyle = severityColor;
  ctx.fillRect(0, 0, 8, HEIGHT);

  // Top section: severity badge
  ctx.fillStyle = severityColor;
  const badgeText = lang === "fil"
    ? { yellow: "PAALALA", orange: "PAGBABANTAY", red: "BABALA", evacuate: "LUMIKAS NA" }[severity]
    : { yellow: "ADVISORY", orange: "WATCH", red: "WARNING", evacuate: "EVACUATE NOW" }[severity];
  ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
  const badgeWidth = ctx.measureText(badgeText).width + 24;
  ctx.fillRect(24, 24, badgeWidth, 28);
  ctx.fillStyle = SEVERITY_TEXT_HEX[severity];
  ctx.fillText(badgeText, 36, 44);

  // Zone name
  ctx.fillStyle = textColor;
  ctx.font = "bold 28px system-ui, -apple-system, sans-serif";
  const maxZoneWidth = WIDTH - 48;
  const truncatedZone = truncateText(ctx, zoneName, maxZoneWidth);
  ctx.fillText(truncatedZone, 24, 100);

  // Alert message (word-wrapped)
  ctx.font = "16px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = textColor;
  const lines = wrapText(ctx, message, maxZoneWidth, 3);
  lines.forEach((line, i) => {
    ctx.fillText(line, 24, 140 + i * 24);
  });

  // Evacuation center
  const evacY = 140 + lines.length * 24 + 24;
  ctx.fillStyle = mutedColor;
  ctx.font = "14px system-ui, -apple-system, sans-serif";
  const evacLabel = lang === "fil" ? "Evacuation Center:" : "Evacuation Center:";
  ctx.fillText(evacLabel, 24, evacY);
  ctx.fillStyle = "#0f766e";
  ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
  const truncatedEvac = truncateText(ctx, evacuationCenter, maxZoneWidth);
  ctx.fillText(truncatedEvac, 24, evacY + 24);

  // Bottom bar: branding
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, HEIGHT - 48, WIDTH, 48);
  ctx.fillStyle = mutedColor;
  ctx.font = "13px system-ui, -apple-system, sans-serif";
  ctx.fillText("WeatherWell — Flood Alerts & Evacuation Guidance", 24, HEIGHT - 20);

  // Severity dot in bottom-right
  ctx.beginPath();
  ctx.arc(WIDTH - 24, HEIGHT - 24, 8, 0, Math.PI * 2);
  ctx.fillStyle = severityColor;
  ctx.fill();

  // Convert to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1.0);
  });
}

/** Truncate text with ellipsis if it exceeds maxWidth. */
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + "...").width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "...";
}

/** Word-wrap text to fit within maxWidth, returning at most maxLines. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) {
        // Add ellipsis to last line
        lines[lines.length - 1] = truncateText(ctx, lines[lines.length - 1], maxWidth);
        return lines;
      }
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Downloads a Blob as a file with the given filename.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
