import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The palette's contrast, computed from globals.css itself (WCAG 2.1 AA audit,
 * Stage 4 Task 4). jsdom has no layout or colour engine, so the axe sweep
 * cannot see this. Neutral OKLCH colours only: for chroma 0, linear luminance
 * is L cubed, and the browser blends a translucent colour in sRGB.
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

function token(name: string): { l: number; alpha: number } {
  const match = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) 0 0(?: / ([\\d.]+)%)?\\)`).exec(root);
  if (!match) throw new Error(`--${name} is not a neutral oklch colour in :root`);
  return { l: Number(match[1]), alpha: match[2] ? Number(match[2]) / 100 : 1 };
}

const encode = (y: number) => (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055);
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** Contrast of a token drawn on the page background. */
function contrastOnBackground(name: string): number {
  const background = encode(token("background").l ** 3);
  const { l, alpha } = token(name);
  const blended = alpha * encode(l ** 3) + (1 - alpha) * background;
  const [hi, lo] = [decode(blended), decode(background)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

describe("colour contrast of the palette (WCAG 2.1 AA)", () => {
  it("text: body and muted text reach 4.5:1 on the background (1.4.3)", () => {
    expect(contrastOnBackground("foreground")).toBeGreaterThanOrEqual(4.5);
    expect(contrastOnBackground("muted-foreground")).toBeGreaterThanOrEqual(4.5);
  });

  it("form fields' edges reach 3:1, so an empty box can be found (1.4.11)", () => {
    expect(contrastOnBackground("input")).toBeGreaterThanOrEqual(3);
  });

  it("the focus ring reaches 3:1 (1.4.11, 2.4.7)", () => {
    expect(contrastOnBackground("ring")).toBeGreaterThanOrEqual(3);
  });

  it("nothing draws the focus ring at half strength, which would fall below 3:1", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx|css)$/.test(entry) && !entry.includes(".test.")) files.push(path);
      }
    };
    walk(join(process.cwd(), "src"));
    const halfStrength = files.filter((file) => /(ring|outline)-ring\/50/.test(readFileSync(file, "utf8")));
    expect(halfStrength).toEqual([]);
  });
});
