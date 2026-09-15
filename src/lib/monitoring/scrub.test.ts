import { describe, it, expect } from "vitest";
import { scrub } from "./scrub";

describe("scrub", () => {
  it("keeps only the path of a route — never a sign-in key or a next target", () => {
    expect(scrub(new Error("x"), "/auth/confirm?token_hash=abc123&type=email#frag")!.route).toBe("/auth/confirm");
    expect(scrub(new Error("x"), "https://weatherwell.test/sign-in?next=/admin")!.route).toBe("/sign-in");
  });

  it("redacts emails, UUIDs, coordinates and long tokens from message and stack", () => {
    const err = new Error(
      "user wilson@example.com id 098f16be-1691-4c94-a1cd-a3440bc9173f at 16.0288, 120.4366 key eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc"
    );
    err.stack = `Error: see wilson@example.com\n    at f (app.js:1:1) 16.08,120.40`;
    const r = scrub(err, "/")!;
    for (const text of [r.message, r.stack ?? ""]) {
      expect(text).not.toMatch(/wilson@example\.com/);
      expect(text).not.toMatch(/098f16be/);
      expect(text).not.toMatch(/16\.0288|120\.4366|16\.08,\s*120\.40/);
      expect(text).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
    }
    expect(r.message).toContain("[email]");
    expect(r.message).toContain("[id]");
    expect(r.message).toContain("[coords]");
    expect(r.message).toContain("[token]");
  });

  it.each([
    ["an RLS refusal", 'new row violates row-level security policy for table "alerts"'],
    ["a permission code", "42501: permission denied"],
    ["an out-of-area refusal", "not an official for this barangay"],
    ["an offline fetch", "Failed to fetch"],
    ["a network error", "NetworkError when attempting to fetch resource."],
    ["a Next redirect", "NEXT_REDIRECT"],
    ["a Next not-found", "NEXT_NOT_FOUND"],
  ])("drops %s", (_label, message) => {
    expect(scrub(new Error(message), "/")).toBeNull();
  });

  it("drops an AbortError by name", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    expect(scrub(err, "/")).toBeNull();
  });

  it("gives the same error the same fingerprint, and a different error a different one", () => {
    const a1 = new Error("Cannot read properties of undefined (reading 'flood')");
    a1.stack = "TypeError: x\n    at Panel (panel.js:10:5)\n    at other";
    const a2 = new Error("Cannot read properties of undefined (reading 'flood')");
    a2.stack = "TypeError: x\n    at Panel (panel.js:10:5)\n    at somewhere else";
    const b = new Error("Cannot read properties of undefined (reading 'landslide')");
    b.stack = a1.stack;
    expect(scrub(a1, "/")!.fingerprint).toBe(scrub(a2, "/")!.fingerprint);
    expect(scrub(a1, "/")!.fingerprint).not.toBe(scrub(b, "/")!.fingerprint);
    expect(scrub(a1, "/")!.fingerprint).toMatch(/^[0-9a-f]{8,64}$/);
  });

  it("handles non-Error throwables without throwing", () => {
    expect(scrub("plain string failure", "/")!.message).toBe("plain string failure");
    expect(scrub({ weird: true }, "/")!.message).toBe("[object Object]");
    expect(scrub(undefined, "/")!.message).toBe("undefined");
  });
});

/**
 * Fix round 1: the reviewer ran scrub()'s regexes directly against inputs
 * not covered by the tests above and found nine reproducible leaks (review
 * §1, points 1-5 in the findings list) plus a JWT with short, dot-separated
 * segments. Privacy beats debuggability: every case below asserts the raw
 * sensitive substring is ABSENT from the redacted text, not merely that some
 * placeholder is present — a placeholder appearing *alongside* a leak would
 * still pass a weaker assertion.
 */
describe("scrub — privacy hardening (review round 1)", () => {
  it("redacts coordinates separated by a space, not just a comma", () => {
    const r = scrub(new Error("flood level at 16.02 120.43 exceeded"), "/")!;
    expect(r.message).not.toMatch(/16\.02/);
    expect(r.message).not.toMatch(/120\.43/);
    expect(r.message).toContain("[coords]");
  });

  it("redacts lat/lng query-param-style coordinates", () => {
    const r = scrub(new Error("geolocate failed lat=16.02&lng=120.43"), "/")!;
    expect(r.message).not.toMatch(/16\.02/);
    expect(r.message).not.toMatch(/120\.43/);
    expect(r.message).toContain("[coords]");
  });

  it("redacts lat/lng key: value coordinates", () => {
    const r = scrub(new Error("geolocate failed lat: 16.02, lng: 20.43"), "/")!;
    expect(r.message).not.toMatch(/16\.02/);
    expect(r.message).not.toMatch(/20\.43/);
    expect(r.message).toContain("[coords]");
  });

  it("redacts a standalone high-precision decimal even with no paired number", () => {
    const r = scrub(new Error("unexpected reading 16.028851 at sensor"), "/")!;
    expect(r.message).not.toMatch(/16\.028851/);
    expect(r.message).toContain("[num]");
  });

  it("redacts an email split across a newline", () => {
    const r = scrub(new Error("user wilson@example\n.com reported issue"), "/")!;
    expect(r.message).not.toMatch(/wilson@example/);
    expect(r.message).toContain("[email]");
  });

  it("redacts a UUID split across a newline", () => {
    const r = scrub(
      new Error("user id 098f16be-1691-4c94-\na1cd-a3440bc9173f flagged"),
      "/"
    )!;
    expect(r.message).not.toMatch(/098f16be/);
    expect(r.message).not.toMatch(/a3440bc9173f/);
    expect(r.message).toContain("[id]");
  });

  it("redacts a short OAuth code= fragment", () => {
    const r = scrub(
      new Error("OAuth error: code=SplxlOBeZQQYbYS6WxSbIA state=af0ifjsldkj"),
      "/"
    )!;
    expect(r.message).not.toMatch(/SplxlOBeZQQYbYS6WxSbIA/);
    expect(r.message).toContain("[token]");
  });

  it("redacts a short access_token= fragment", () => {
    const r = scrub(
      new Error("session restore failed access_token=SlAV32hkKG expired"),
      "/"
    )!;
    expect(r.message).not.toMatch(/SlAV32hkKG/);
    expect(r.message).toContain("[token]");
  });

  it("redacts a PH mobile number, local format", () => {
    const r = scrub(new Error("invalid phone 09171234567 for zone signup"), "/")!;
    expect(r.message).not.toMatch(/09171234567/);
    expect(r.message).toContain("[phone]");
  });

  it("redacts a PH mobile number, international format", () => {
    const r = scrub(new Error("invalid phone +639171234567 for zone signup"), "/")!;
    expect(r.message).not.toMatch(/639171234567/);
    expect(r.message).toContain("[phone]");
  });

  it("redacts a PH mobile number written with spaces or dashes", () => {
    const spaced = scrub(new Error("callback to 0917 123 4567 failed"), "/")!;
    expect(spaced.message).not.toMatch(/0917.?123.?4567/);
    expect(spaced.message).toContain("[phone]");

    const dashed = scrub(new Error("callback to +63 917-123-4567 failed"), "/")!;
    expect(dashed.message).not.toMatch(/917.?123.?4567/);
    expect(dashed.message).toContain("[phone]");
  });

  it("redacts any other long run of digits as a phone number", () => {
    const r = scrub(new Error("reference 1234567890123 could not be matched"), "/")!;
    expect(r.message).not.toMatch(/1234567890123/);
    expect(r.message).toContain("[phone]");
  });

  it("redacts an IPv4 address", () => {
    const r = scrub(new Error("ECONNREFUSED 203.0.113.5:5432 connecting to db"), "/")!;
    expect(r.message).not.toMatch(/203\.0\.113\.5/);
    expect(r.message).toContain("[ip]");
  });

  it("redacts a full-form IPv6 address", () => {
    const r = scrub(
      new Error("connect failed to 2001:0db8:85a3:0000:0000:8a2e:0370:7334"),
      "/"
    )!;
    expect(r.message).not.toMatch(/2001:0db8:85a3/);
    expect(r.message).toContain("[ip]");
  });

  it("redacts a JWT whose dot-separated segments are each under 24 characters", () => {
    const r = scrub(
      new Error(
        "auth failed eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl bad token"
      ),
      "/"
    )!;
    expect(r.message).not.toMatch(/eyJhbGciOiJIUzI1NiJ9/);
    expect(r.message).not.toMatch(/eyJzdWIiOiIxMjMifQ/);
    expect(r.message).not.toMatch(/c2lnbmF0dXJl/);
    expect(r.message).toContain("[token]");
  });
});
