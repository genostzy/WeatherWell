import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const maybeSingle = vi.fn();
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ auth: { getSession, onAuthStateChange }, from }),
}));

import { useOfficialRole } from "./use-official-role";

const signedIn = (isAnonymous = false) => ({ data: { session: { user: { id: "u1", is_anonymous: isAnonymous } } } });

beforeEach(() => {
  getSession.mockReset();
  maybeSingle.mockReset();
  from.mockClear();
  onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe("useOfficialRole", () => {
  it("names a municipal official by their 7-digit town area", async () => {
    getSession.mockResolvedValue(signedIn());
    maybeSingle.mockResolvedValue({ data: { role: "operator", area_code: "0105528", display_name: "Pedro" } });
    const { result } = renderHook(() => useOfficialRole());
    await waitFor(() => expect(result.current).toEqual({ level: "municipality", areaCode: "0105528", displayName: "Pedro" }));
  });

  it("names a barangay official and an admin", async () => {
    getSession.mockResolvedValue(signedIn());
    maybeSingle.mockResolvedValue({ data: { role: "operator", area_code: "0105528012", display_name: "Kap" } });
    const barangay = renderHook(() => useOfficialRole());
    await waitFor(() => expect(barangay.result.current?.level).toBe("barangay"));

    maybeSingle.mockResolvedValue({ data: { role: "admin", area_code: null, display_name: "Admin" } });
    const admin = renderHook(() => useOfficialRole());
    await waitFor(() => expect(admin.result.current?.level).toBe("admin"));
  });

  it("is null for a resident, and never asks the database for an anonymous session", async () => {
    getSession.mockResolvedValue(signedIn(true));
    const anon = renderHook(() => useOfficialRole());
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(from).not.toHaveBeenCalled();
    expect(anon.result.current).toBeNull();

    getSession.mockResolvedValue(signedIn());
    maybeSingle.mockResolvedValue({ data: { role: "resident", area_code: null, display_name: null } });
    const resident = renderHook(() => useOfficialRole());
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(resident.result.current).toBeNull();
  });
});
