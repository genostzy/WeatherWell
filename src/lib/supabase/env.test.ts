import { describe, it, expect } from "vitest";
import { readSupabaseEnv } from "./env";

/**
 * A missing environment variable in a flood-warning system should fail at the
 * first request with a sentence naming the variable — not surface later as an
 * empty zone list that looks like "no alerts".
 */
describe("readSupabaseEnv", () => {
  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  };

  it("returns both values when present", () => {
    expect(readSupabaseEnv(valid)).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("names the missing variable rather than failing vaguely", () => {
    expect(() => readSupabaseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: undefined })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/
    );
  });

  it("treats a blank string as missing, since that is what an unset .env line produces", () => {
    expect(() =>
      readSupabaseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   " })
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("refuses a service-role key, which must never reach a NEXT_PUBLIC_ variable", () => {
    // A NEXT_PUBLIC_ variable is compiled into the browser bundle. A service
    // key there is a total compromise of every RLS policy in the system.
    expect(() =>
      readSupabaseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc123" })
    ).toThrow(/service|secret/i);
  });
});
