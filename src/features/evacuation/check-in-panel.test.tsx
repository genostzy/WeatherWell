import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckInPanel } from "./check-in-panel";

// recordCheckIn triggers a drain, which calls ensureAnonymousSession — stub
// it to resolve null (offline-like) so the real Supabase browser client is
// never touched and, since drainOutbox then never runs, the dynamically
// -imported Server Action (record-check-in.ts, which transitively pulls in
// user-server.ts's `import "server-only"`) never loads either.
// useSessionUserId is stubbed alongside it for the same reason — this panel
// is a pure read of "am I already signed in", not a write.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: vi.fn().mockResolvedValue(null),
  useSessionUserId: () => null,
}));

describe("CheckInPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    // useEvacuationCheckIns fetches /api/check-ins on mount; stub it to an
    // empty list so every test starts from "no server rows" and the assertions
    // below are entirely about the queued, optimistic check-in.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says who sees a check-in and where to call in an emergency", () => {
    render(<CheckInPanel zoneId="zone-1" />);
    expect(screen.getByText(/your barangay officials see this/i)).toBeInTheDocument();
    expect(screen.getByText(/911/)).toBeInTheDocument();
    expect(screen.queryByText(/phase 1/i)).not.toBeInTheDocument();
  });

  it("shows no confirmation before a resident checks in", () => {
    render(<CheckInPanel zoneId="zone-1" />);
    expect(screen.queryByText(/you checked in/i)).not.toBeInTheDocument();
  });

  it("confirms after tapping I'm safe", async () => {
    const user = userEvent.setup();
    render(<CheckInPanel zoneId="zone-1" />);
    await user.click(screen.getByRole("button", { name: /i'm safe/i }));
    expect(screen.getByText(/you checked in as safe/i)).toBeInTheDocument();
  });

  it("confirms after tapping I need help", async () => {
    const user = userEvent.setup();
    render(<CheckInPanel zoneId="zone-1" />);
    await user.click(screen.getByRole("button", { name: /i need help/i }));
    expect(screen.getByText(/you checked in as needing help/i)).toBeInTheDocument();
  });

  it("lets a resident change their status after already checking in", async () => {
    const user = userEvent.setup();
    render(<CheckInPanel zoneId="zone-1" />);
    await user.click(screen.getByRole("button", { name: /i'm safe/i }));
    await user.click(screen.getByRole("button", { name: /i need help/i }));
    expect(screen.getByText(/you checked in as needing help/i)).toBeInTheDocument();
    expect(screen.queryByText(/you checked in as safe/i)).not.toBeInTheDocument();
  });
});
