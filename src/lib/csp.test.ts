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

  it("lets an official's page show a pin photo, which is served by Supabase Storage, or every photo is blocked", async () => {
    // A signed link points at <project>.supabase.co/storage/v1/object/sign/...
    // connect-src covers the request that makes the link, not the <img> that
    // loads it; jsdom enforces no policy, so only this pins it.
    expect(await directive("img-src")).toContain("https://*.supabase.co");
  });
});
