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

  it("confirms the withdrawal instead of the status region just going blank", async () => {
    const user = userEvent.setup();
    renderWithData(<QuickDepthReport zoneId="zone-1" />);

    await user.click(screen.getByRole("button", { name: /waist-deep/i }));
    await user.click(screen.getByRole("button", { name: /undo/i }));

    expect(screen.getByRole("status").textContent).toMatch(/withdrawn|nabawi/i);
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

  it("replaces the queued report on a correction tap, rather than filing both", async () => {
    // A mis-tap followed immediately by the correct depth is the exact
    // scenario the undo window exists to absorb — but pressing a second
    // depth button, not Undo, is the more natural correction gesture, and it
    // must not leave two reports queued for one resident's one intent.
    const user = userEvent.setup();
    renderWithData(<QuickDepthReport zoneId="zone-1" />);

    await user.click(screen.getByRole("button", { name: /knee-deep/i }));
    await user.click(screen.getByRole("button", { name: /waist-deep/i }));

    const queued = readOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0].payload).toMatchObject({ depthLevel: "waist" });
  });

  it("holds the report back from the wire for the whole undo window, so a network round trip can never outrace it", async () => {
    // Review Focus 4's other half: the entry being "still queued" is not
    // proof it was never sent — enqueue also wakes the service worker
    // immediately (requestBackgroundSend), and a fast response could confirm
    // delivery well inside the 3s window. The only way undo can never lie is
    // if nothing attempts to send during the window at all.
    const user = userEvent.setup();
    renderWithData(<QuickDepthReport zoneId="zone-1" />);

    const before = Date.now();
    await user.click(screen.getByRole("button", { name: /dry/i }));

    const [entry] = readOutbox();
    expect(entry.nextAttemptAt).not.toBeNull();
    expect(Date.parse(entry.nextAttemptAt!)).toBeGreaterThanOrEqual(before + 3000 - 50);
  });

  it("gives Undo a real touch target, not a 28px ghost button, on a 3-second deadline", async () => {
    const user = userEvent.setup();
    renderWithData(<QuickDepthReport zoneId="zone-1" />);

    await user.click(screen.getByRole("button", { name: /ankle-deep/i }));

    const undo = screen.getByRole("button", { name: /undo/i });
    // h-11 (44px, WCAG 2.5.5) is this app's `lg` button size — every other
    // primary control uses it; Undo is the one control on this surface a
    // panicked resident has 3 seconds to hit accurately.
    expect(undo.className).toMatch(/h-11/);
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

  it("keeps no empty line under the buttons until there is something to say (owner: uneven gaps on the phone)", () => {
    renderWithData(<QuickDepthReport zoneId="zone-1" />);
    expect(screen.getByRole("status")).toHaveClass("sr-only");
  });

  describe("says what the report counts toward (so residents know it mattered)", () => {
    it("tells how many more neighbours are needed before an advisory", async () => {
      const user = userEvent.setup();
      renderWithData(<QuickDepthReport zoneId="zone-1" />, { alerts: [] });
      await user.click(screen.getByRole("button", { name: /knee-deep/i }));
      expect(await screen.findByText(/at least 2 more neighbours/i)).toBeInTheDocument();
    });

    it("says a dry report tells officials it is dry", async () => {
      const user = userEvent.setup();
      renderWithData(<QuickDepthReport zoneId="zone-1" />, { alerts: [] });
      await user.click(screen.getByRole("button", { name: /^dry/i }));
      expect(await screen.findByText(/dry where you are/i)).toBeInTheDocument();
    });

    it("says the report shows how deep it is when the barangay already has an alert", async () => {
      const user = userEvent.setup();
      renderWithData(<QuickDepthReport zoneId="zone-1" />, {
        alerts: [
          {
            id: "a", zoneId: "zone-1", severity: "red", message: { en: "x", fil: "x" }, source: "manual",
            confidence: "validated", issuedAt: new Date().toISOString(), isActive: true,
          },
        ],
      });
      await user.click(screen.getByRole("button", { name: /knee-deep/i }));
      expect(await screen.findByText(/already has an alert/i)).toBeInTheDocument();
    });
  });
});
