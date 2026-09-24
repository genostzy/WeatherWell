import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

async function directive(name: string): Promise<string> {
  const rules = await nextConfig.headers!();
  const csp = rules[0].headers.find((h) => h.key === "Content-Security-Policy")!.value;
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";
}

describe("Content-Security-Policy (found testing the live site)", () => {
  it("lets the service worker fetch map tiles, or the map stays grey until a hard reload", async () => {
    // sw.js runs under this same policy and fetches tiles with fetch(), which
    // connect-src governs; img-src alone only covers pages without a worker.
    expect(await directive("connect-src")).toContain("https://*.tile.openstreetmap.org");
  });
});
