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
