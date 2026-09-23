import { describe, it, expect } from "vitest";
import { friendlyError } from "./friendly-error";

describe("friendlyError", () => {
  it("translates Supabase's wrong-password message", () => {
    expect(friendlyError("Invalid login credentials", "fil")).toBe("Mali ang email o password.");
    expect(friendlyError("Invalid login credentials", "en")).toBe("Wrong email or password.");
  });

  it("translates the actions' expired-session message", () => {
    expect(friendlyError("No session — sign in and try again.", "fil")).toMatch(/mag-sign in muli/i);
  });

  it("keeps an unknown message, prefixed in Filipino so the reader knows it failed", () => {
    expect(friendlyError("Database error 23505", "en")).toBe("Database error 23505");
    expect(friendlyError("Database error 23505", "fil")).toBe("Hindi natuloy — subukan ulit. (Database error 23505)");
  });
});
