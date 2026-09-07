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

  /**
   * Builds a real, correctly base64url-encoded JWT with the given payload —
   * not a string that merely contains the literal text "service_role". A
   * legacy Supabase service-role key is a JWT; the literal string only
   * appears in the decoded payload, never in the encoded token, so a guard
   * that string-matches the encoded form never actually fires.
   */
  function fakeJwt(payload: Record<string, unknown>): string {
    const b64url = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return [b64url({ alg: "HS256", typ: "JWT" }), b64url(payload), "fakesignature"].join(".");
  }

  it("refuses a real legacy service-role JWT, decoding the payload rather than string-matching the token", () => {
    const serviceRoleJwt = fakeJwt({
      iss: "supabase",
      ref: "keoxneujsebuedqbmqxz",
      role: "service_role",
      exp: 2000000000,
    });
    expect(() =>
      readSupabaseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: serviceRoleJwt })
    ).toThrow(/service|secret/i);
  });

  it("accepts a legitimate legacy anon JWT, since legacy publishable keys are JWTs too", () => {
    const anonJwt = fakeJwt({
      iss: "supabase",
      ref: "keoxneujsebuedqbmqxz",
      role: "anon",
      exp: 2000000000,
    });
    expect(
      readSupabaseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonJwt })
    ).toEqual({
      url: "https://example.supabase.co",
      publishableKey: anonJwt,
    });
  });
});
