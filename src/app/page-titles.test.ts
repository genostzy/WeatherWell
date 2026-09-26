import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * WCAG 2.4.2: every page names itself in the tab and in a screen reader's
 * window list, instead of each one being just "WeatherWell". A client page
 * can't export metadata, so it takes its title from a layout beside it.
 */
const app = join(process.cwd(), "src/app");
const pages: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (entry === "page.tsx") pages.push(path);
  }
};
walk(app);

const titled = (file: string) =>
  existsSync(file) && /export const metadata[^=]*=\s*\{\s*title:/.test(readFileSync(file, "utf8"));

describe("page titles (WCAG 2.4.2)", () => {
  it("gives every page its own title, with the app's name after it", () => {
    expect(readFileSync(join(app, "layout.tsx"), "utf8")).toContain('template: "%s — WeatherWell"');
    const untitled = pages
      .filter((page) => dirname(page) !== app)
      .filter((page) => !titled(page) && !titled(join(dirname(page), "layout.tsx")))
      .map((page) => relative(app, page));
    expect(untitled).toEqual([]);
  });
});
