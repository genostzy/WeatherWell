import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const loadOfficial = vi.fn();
vi.mock("@/lib/auth/load-official", () => ({ loadOfficial: () => loadOfficial() }));
const notFound = vi.fn((): never => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
const rpc = vi.fn();
vi.mock("@/lib/supabase/user-server", () => ({ createSupabaseUserClient: async () => ({ rpc }) }));
vi.mock("@/features/admin/town-officials-panel", () => ({
  TownOfficialsPanel: ({ officials }: { officials: { displayName: string }[] }) => (
    <p>town panel: {officials.map((o) => o.displayName).join(", ")}</p>
  ),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => ({}) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { admin: {} } }) }));
vi.mock("@/features/admin/officials-panel", () => ({ OfficialsPanel: () => <p>admin panel</p> }));

import OfficialsPage from "./page";

const base = { userId: "u", displayName: "X", areaName: "Mapandan" };

beforeEach(() => vi.clearAllMocks());

describe("/admin/officials", () => {
  it("gives a municipal official their town's barangay officials", async () => {
    loadOfficial.mockResolvedValue({ state: "official", official: { ...base, level: "municipality", areaCode: "0105528" } });
    rpc.mockResolvedValue({ data: [{ user_id: "u2", display_name: "Kap Nilo", area_code: "0105528012" }], error: null });
    render(await OfficialsPage());
    expect(rpc).toHaveBeenCalledWith("town_officials");
    expect(screen.getByRole("heading", { level: 1, name: /barangay officials/i })).toBeInTheDocument();
    expect(screen.getByText("town panel: Kap Nilo")).toBeInTheDocument();
  });

  it("is not there for a barangay official", async () => {
    loadOfficial.mockResolvedValue({ state: "official", official: { ...base, level: "barangay", areaCode: "0105528012" } });
    await expect(OfficialsPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
