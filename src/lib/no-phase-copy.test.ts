import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * V1 is live, so nothing a resident or official reads may still promise
 * "from Phase 3" or call itself a "Phase 1 demo" (found testing the live
 * site). Checks every en:/fil: string literal in the app's source.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !path.includes("mock-data") ? [path] : [];
  });
}

describe("user-facing copy", () => {
  it("never mentions a build phase", () => {
    const offenders = sourceFiles(join(process.cwd(), "src")).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /^\s*(en|fil|"[a-z-]+"):\s*["`].*Phase\s*\d/.test(line))
        .map((line) => `${file}: ${line.trim().slice(0, 80)}`)
    );
    expect(offenders).toEqual([]);
  });
});
