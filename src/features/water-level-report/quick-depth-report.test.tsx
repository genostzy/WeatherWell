import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickDepthReport } from "./quick-depth-report";
import { renderWithData } from "@/test-utils/render-with-data";
import { readOutbox } from "@/lib/outbox/outbox";

// Filing a report triggers a drain, which calls ensureAnonymousSession —
// stubbed to the offline answer so this file never constructs the real
// Supabase browser client and hangs the suite on a real network call (same
// reasoning as src/app/report/page.test.tsx).
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() },
  });
});

describe("QuickDepthReport", () => {
  it("files the report on the depth tap itself — one tap, no separate submit", async () => {
    const user = userEvent.setup();
    renderWithData(<QuickDepthReport zoneId="zone-1" />);

    await user.click(screen.getByRole("button", { name: /knee-deep/i }));

    const queued = readOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0].payload).toMatchObject({ zoneId: "zone-1", depthLevel: "knee" });
  });

  it("offers undo instead of asking for confirmation first", async () => {
    const user = userEvent.setup();
    renderWithData(<QuickDepthReport zoneId="zone-1" />);

    await user.click(screen.getByRole("button", { name: /waist-deep/i }));
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /undo/i }));
    expect(readOutbox()).toHaveLength(0);
  });

  it("stops offering undo once the window has passed", async () => {
    // fireEvent, not userEvent: userEvent.click() under vi.useFakeTimers()
    // hangs indefinitely in this project's React 19 + testing-library setup
    // (confirmed by isolating the click alone) — the awaited click never
    // resolves, so the test's own `finally { vi.useRealTimers() }` never
    // runs either, leaking fake timers into whichever test runs next.
    // fireEvent.click is synchronous and sidesteps the interaction entirely.
    vi.useFakeTimers();
    try {
      renderWithData(<QuickDepthReport zoneId="zone-1" />);

      fireEvent.click(screen.getByRole("button", { name: /ankle-deep/i }));
      expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
      expect(readOutbox()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("degrades to a truthful message when undo lands after delivery", async () => {
    // Review Focus 4: the drain may deliver the report between the tap and
    // the undo. The entry is gone from the queue; undo must say so rather
    // than appear to succeed at withdrawing something already filed.
    const user = userEvent.setup();
    renderWithData(<QuickDepthReport zoneId="zone-1" />);

    await user.click(screen.getByRole("button", { name: /neck-deep/i }));
    // Simulate the drain clearing the queue before undo is pressed.
    window.localStorage.setItem("weatherwell.outbox", "[]");

    await user.click(screen.getByRole("button", { name: /undo/i }));

    expect(screen.getByRole("status").textContent).toMatch(/already sent|already reached/i);
  });
});
