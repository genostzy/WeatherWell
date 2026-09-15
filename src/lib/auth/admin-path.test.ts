import { describe, it, expect } from "vitest";
import { isAdminPath } from "./admin-path";

describe("isAdminPath", () => {
  it("treats /admin itself as an admin route", () => {
    expect(isAdminPath("/admin")).toBe(true);
  });

  it("treats /admin/ as an admin route", () => {
    expect(isAdminPath("/admin/")).toBe(true);
  });

  it("treats a nested admin route as an admin route", () => {
    expect(isAdminPath("/admin/zone/zone-1")).toBe(true);
  });

  it("does not treat /administration as an admin route", () => {
    // A bare `startsWith("/admin")` would wrongly match this — "/admin" is a
    // prefix of "/administration" but the two are unrelated routes.
    expect(isAdminPath("/administration")).toBe(false);
  });

  it("does not treat /admin-help as an admin route", () => {
    expect(isAdminPath("/admin-help")).toBe(false);
  });

  it("does not treat unrelated routes as admin routes", () => {
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/report")).toBe(false);
  });
});
