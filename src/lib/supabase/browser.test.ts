import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => ({ marker: Math.random() })),
}));

import { createBrowserClient } from "@supabase/ssr";
import { getBrowserClient } from "./browser";

describe("getBrowserClient", () => {
  beforeEach(() => {
    vi.mocked(createBrowserClient).mockClear();
    // getBrowserClient reads process.env directly (it must, to stay
    // inlineable by Next in the browser bundle — see the comment in
    // browser.ts). Vitest does not load .env.local into process.env the way
    // `next dev` does, so these stand in for it here.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the same client on repeated calls", () => {
    // Two clients means two auth listeners racing to refresh the same token,
    // which is how a resident gets silently signed out mid-report.
    expect(getBrowserClient()).toBe(getBrowserClient());
  });

  it("constructs the underlying client only once per module instance", async () => {
    // vi.resetModules + a dynamic import gives this test a fresh module
    // instance, independent of whatever the other test in this file already
    // did to the shared module-level cache. mockClear() only resets the call
    // count, not that cache, so reusing the top-level import here would make
    // the assertion depend on test order rather than on the singleton
    // property it's meant to verify.
    vi.resetModules();
    const { getBrowserClient: freshGetBrowserClient } = await import("./browser");

    freshGetBrowserClient();
    freshGetBrowserClient();

    expect(createBrowserClient).toHaveBeenCalledTimes(1);
  });
});
