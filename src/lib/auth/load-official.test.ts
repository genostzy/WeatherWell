import { describe, it, expect, vi, beforeEach } from "vitest";

// load-official.ts itself does `import "server-only"` (it is a server-only
// module, not merely a transitive consumer of one) — that throws unconditionally
// under Vitest's module resolution, which never sets the "react-server" export
// condition Next.js's real bundler does. Every other server-only-adjacent test
// in this repo sidesteps the throw by mocking away the *caller* of the
// server-only module; here the module under test IS that caller, so the
// package itself has to be replaced.
vi.mock("server-only", () => ({}));

const getClaims = vi.fn();
const userFrom = vi.fn();
const referenceFrom = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, from: userFrom }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from: referenceFrom }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // loadOfficial is wrapped in React's `cache`, which memoizes per module
  // instance outside of a real Next.js request. Without resetting the module
  // registry, the second test in this file would silently reuse the first
  // test's resolved promise instead of exercising the mocks it just set up.
  vi.resetModules();
});

function profileChain(profile: { role: string; area_code: string | null; display_name: string | null } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  userFrom.mockReturnValue({ select });
  return { select, eq, maybeSingle };
}

function placeChain(place: { name: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: place });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  referenceFrom.mockReturnValue({ select });
  return { select, eq, maybeSingle };
}

describe("loadOfficial", () => {
  it("returns signed-out when getClaims carries no verified claims", async () => {
    getClaims.mockResolvedValue({ data: null });
    const { loadOfficial } = await import("./load-official");

    const gate = await loadOfficial();

    expect(gate).toEqual({ state: "signed-out" });
    expect(userFrom).not.toHaveBeenCalled();
  });

  it("returns not-appointed with the signed-in email when the profile role is not operator", async () => {
    // area_code and display_name are deliberately populated here so this test
    // isolates the role check itself — a profile that has both fields filled
    // in but is not "operator" must still land on not-appointed.
    getClaims.mockResolvedValue({ data: { claims: { sub: "resident-1", email: "resident@example.com" } } });
    profileChain({ role: "resident", area_code: "1234567890", display_name: "Juan Dela Cruz" });
    const { loadOfficial } = await import("./load-official");

    const gate = await loadOfficial();

    expect(gate).toEqual({ state: "not-appointed", email: "resident@example.com" });
  });

  it("returns not-appointed with a null email for an anonymous session", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "anon-1" } } });
    profileChain({ role: "resident", area_code: null, display_name: null });
    const { loadOfficial } = await import("./load-official");

    const gate = await loadOfficial();

    expect(gate).toEqual({ state: "not-appointed", email: null });
  });

  it("resolves a 10-digit operator's area against zones, as a barangay", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    profileChain({ role: "operator", area_code: "1234567890", display_name: "Juana Dela Cruz" });
    placeChain({ name: "Barangay Uno" });
    const { loadOfficial } = await import("./load-official");

    const gate = await loadOfficial();

    expect(gate).toEqual({
      state: "official",
      official: {
        userId: "official-1",
        displayName: "Juana Dela Cruz",
        areaCode: "1234567890",
        areaName: "Barangay Uno",
        level: "barangay",
      },
    });
    expect(referenceFrom).toHaveBeenCalledWith("zones");
  });

  it("resolves a 7-digit operator's area against municipalities, as a municipality", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-2" } } });
    profileChain({ role: "operator", area_code: "1234567", display_name: "Pedro Reyes" });
    placeChain({ name: "San Isidro" });
    const { loadOfficial } = await import("./load-official");

    const gate = await loadOfficial();

    expect(gate).toEqual({
      state: "official",
      official: {
        userId: "official-2",
        displayName: "Pedro Reyes",
        areaCode: "1234567",
        areaName: "San Isidro",
        level: "municipality",
      },
    });
    expect(referenceFrom).toHaveBeenCalledWith("municipalities");
  });

  it("queries only the caller's own profile row, by id", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-3" } } });
    const { select, eq } = profileChain({ role: "operator", area_code: "1234567890", display_name: "X" });
    placeChain({ name: "Y" });
    const { loadOfficial } = await import("./load-official");

    await loadOfficial();

    expect(select).toHaveBeenCalledWith("role, area_code, display_name");
    expect(eq).toHaveBeenCalledWith("id", "official-3");
  });

  it("falls back to the raw area code when no matching zone or municipality name is found", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-4" } } });
    profileChain({ role: "operator", area_code: "1234567890", display_name: "Ana Santos" });
    placeChain(null);
    const { loadOfficial } = await import("./load-official");

    const gate = await loadOfficial();

    expect(gate).toEqual({
      state: "official",
      official: {
        userId: "official-4",
        displayName: "Ana Santos",
        areaCode: "1234567890",
        areaName: "1234567890",
        level: "barangay",
      },
    });
  });
});
