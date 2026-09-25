import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState, useEffect } from "react";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithData } from "@/test-utils/render-with-data";
import { formatActionTime } from "@/lib/official-actions-copy";
import { OUTBOX_DB } from "@/lib/outbox/idb";
import type { OutboxEntry } from "@/lib/outbox/types";
import { OutboxBadge } from "./outbox-badge";

const OUTBOX_KEY = "weatherwell.outbox";

/**
 * A minimal, genuinely reactive stand-in for `useSessionUserId()` (fix round
 * 1, finding 1): a plain `() => currentValue` mock would let the component
 * read a NEW id without ever re-rendering to notice it, which would make the
 * "switches without a reload" test pass for the wrong reason (or not exercise
 * the bug at all). This has real React state and a subscriber, the same
 * shape `onAuthStateChange` gives the real hook, so `setSessionUserId` below
 * drives an actual re-render — exactly what the real hook does when Supabase
 * fires an auth-state change.
 */
const auth = vi.hoisted(() => {
  let userId: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => userId,
    set: (next: string | null) => {
      userId = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

vi.mock("@/lib/auth/anonymous-session", () => ({
  useSessionUserId: () => {
    const [id, setId] = useState(auth.get());
    useEffect(() => auth.subscribe(() => setId(auth.get())), []);
    return id;
  },
  // Never reached by these tests (every retried entry already has an owner),
  // but session-drain.ts imports it, so the mock must define it.
  ensureAnonymousSession: async () => auth.get(),
}));

/**
 * The page drain a Retry tap starts reads the session through the browser
 * client (session-user.ts). Faked here with the same identity the reactive
 * hook above reports, so the drain sends as whoever the badge shows.
 */
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    auth: {
      getSession: async () => {
        const id = auth.get();
        return { data: { session: id ? { user: { id } } : null }, error: null };
      },
    },
  }),
}));

const fetchMock = vi.fn();

/**
 * fake-indexeddb keeps its databases in a process-wide singleton for the
 * whole test file, unlike localStorage which each test clears itself —
 * mirrors the same cleanup outbox.test.ts uses, so a mirrored row from one
 * test never leaks into the next via reconcileWithMirror.
 */
async function resetIdb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(OUTBOX_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function seed(...entries: OutboxEntry[]): void {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries));
}

let counter = 0;

/** Builds a full-shape OutboxEntry, writable straight into localStorage. */
function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  counter += 1;
  const queuedAt = overrides.queuedAt ?? new Date(2026, 8, 16, 9, 30).toISOString();
  return {
    id: `entry-${counter}`,
    operation: "submitWaterLevelReport",
    payload: { zoneId: "zone-1", depthLevel: "knee" },
    queuedAt,
    attempts: 0,
    userId: null,
    status: "pending",
    nextAttemptAt: null,
    updatedAt: queuedAt,
    ...overrides,
  };
}

beforeEach(async () => {
  localStorage.clear();
  await resetIdb();
  auth.set(null);
  counter = 0;
  fetchMock.mockReset();
  // A transient failure, unless a test says otherwise: a retried entry stays
  // pending (backing off), and every drain a tap starts runs to completion.
  // A send that never answered would leave that drain in flight, and the
  // queue's one-drain-at-a-time gate would then decline every later drain
  // in this file.
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ result: "retry" }), { status: 503 })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OutboxBadge", () => {
  it("is hidden when the queue is empty", () => {
    const { container } = renderWithData(<OutboxBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is hidden when the only entries are held, or belong to another user", () => {
    auth.set("user-a");
    seed(
      entry({ userId: "user-a", status: "held" }),
      entry({ userId: "user-b", status: "pending" })
    );
    const { container } = renderWithData(<OutboxBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts the current user's entries plus unowned ones", () => {
    auth.set("user-a");
    seed(
      entry({ userId: "user-a", status: "pending" }),
      entry({ userId: null, status: "pending" })
    );
    renderWithData(<OutboxBadge />);
    expect(screen.getByRole("button", { name: "2 waiting to send" })).toBeInTheDocument();
  });

  it("shows a stuck entry as 'couldn't send', flagged via a data attribute rather than a colour class", () => {
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
    renderWithData(<OutboxBadge />);
    const button = screen.getByRole("button", { name: "1 couldn't send" });
    expect(button).toHaveAttribute("data-state", "stuck");
  });

  it("renders Filipino labels", () => {
    auth.set("user-a");
    seed(
      entry({ userId: "user-a", status: "pending" }),
      entry({ userId: null, status: "pending" })
    );
    renderWithData(<OutboxBadge />, { lang: "fil" });
    expect(
      screen.getByRole("button", { name: "2 naghihintay na maipadala" })
    ).toBeInTheDocument();
  });

  it("renders the Filipino stuck label", () => {
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
    renderWithData(<OutboxBadge />, { lang: "fil" });
    expect(screen.getByRole("button", { name: "1 hindi naipadala" })).toBeInTheDocument();
  });

  it("re-evaluates identity reactively, so a shared phone switching accounts updates the badge without a reload", async () => {
    // Fix round 1, finding 1: entry-1 is A's own pending report; entry-2 is
    // a stuck report B left behind on this device. While A is signed in,
    // only A's own entry counts. The moment identity flips to B — in place,
    // the same way a sign-out or a different Google account would, never a
    // remount — the badge must immediately count only B's entries instead.
    auth.set("user-a");
    seed(
      entry({ userId: "user-a", status: "pending" }),
      entry({ userId: "user-b", status: "stuck", stuckReason: "gave_up" })
    );
    renderWithData(<OutboxBadge />);

    const asA = screen.getByRole("button", { name: "1 waiting to send" });
    expect(asA).toHaveAttribute("data-state", "pending");

    await act(async () => {
      auth.set("user-b");
    });

    const asB = screen.getByRole("button", { name: "1 couldn't send" });
    expect(asB).toHaveAttribute("data-state", "stuck");
    expect(screen.queryByRole("button", { name: "1 waiting to send" })).toBeNull();
  });

  it("lists a counted entry's description, made-at time and status when tapped", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    const queuedAt = new Date(2026, 8, 16, 9, 30).toISOString();
    seed(
      entry({
        userId: "user-a",
        status: "pending",
        queuedAt,
        payload: { zoneId: "zone-1", depthLevel: "knee" },
      })
    );
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 waiting to send" }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Water level report — Barangay Nilombot, Mapandan, Knee-deep")
    ).toBeInTheDocument();
    expect(within(dialog).getByText(formatActionTime(queuedAt, "en"))).toBeInTheDocument();
    expect(within(dialog).getByText("Will send when online")).toBeInTheDocument();
  });

  it("shows the too_old reason text for a too_old stuck entry", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "too_old", lastError: "too_old" }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));

    expect(
      screen.getByText(
        "Couldn't send: Too old to send — report again if it's still flooded."
      )
    ).toBeInTheDocument();
  });

  it("tells a resident outside the barangay why their report was refused (too_far)", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "too_far", lastError: "too_far" }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));

    expect(
      screen.getByText(
        "Couldn't send: Your location is outside this barangay. Reports only count from inside it — if you've moved, change your barangay."
      )
    ).toBeInTheDocument();
  });

  it("says a report is waiting for the 5-minute limit, not for a connection (rate_limited)", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "pending", waitReason: "rate_limited" }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 waiting to send" }));

    expect(
      screen.getByText("Waiting: one report per barangay every 5 minutes. It will send by itself.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Will send when online")).not.toBeInTheDocument();
  });

  it("shows the gave_up reason text for a gave_up stuck entry", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up", lastError: "network" }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));

    expect(
      screen.getByText("Couldn't send: Tried many times without success.")
    ).toBeInTheDocument();
  });

  describe("a permanent failure never shows the server's own text (fix round 1, finding 2)", () => {
    it.each([
      ["a short validation code", "invalid"],
      ["a raw database message", 'duplicate key value violates unique constraint "reports_pkey"'],
      ["the orphaned-pin reason", "pin was never created"],
    ])("in English, for %s", async (_label, lastError) => {
      const user = userEvent.setup();
      auth.set("user-a");
      seed(entry({ userId: "user-a", status: "stuck", stuckReason: "permanent", lastError }));
      renderWithData(<OutboxBadge />);
      await user.click(screen.getByRole("button", { name: "1 couldn't send" }));

      expect(screen.getByText("Couldn't send: This couldn't be accepted.")).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(lastError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeNull();
    });

    it.each([
      ["a short validation code", "invalid"],
      ["a raw database message", 'duplicate key value violates unique constraint "reports_pkey"'],
      ["the orphaned-pin reason", "pin was never created"],
    ])("in Filipino, for %s", async (_label, lastError) => {
      const user = userEvent.setup();
      auth.set("user-a");
      seed(entry({ userId: "user-a", status: "stuck", stuckReason: "permanent", lastError }));
      renderWithData(<OutboxBadge />, { lang: "fil" });
      await user.click(screen.getByRole("button", { name: "1 hindi naipadala" }));

      expect(screen.getByText("Hindi naipadala: Hindi ito tinanggap.")).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(lastError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeNull();
    });
  });

  it("Retry turns the entry pending again, and the badge returns to 'waiting'", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up", queuedAt: new Date().toISOString() }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("button", { name: "1 waiting to send" })).toBeInTheDocument();
    const [stored] = JSON.parse(localStorage.getItem(OUTBOX_KEY)!) as OutboxEntry[];
    expect(stored.status).toBe("pending");
  });

  it("Retry sends: a tap POSTs the entry to /api/outbox/<operation> without waiting for another write (I-2)", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    const stuck = entry({
      userId: "user-a",
      operation: "recordCheckIn",
      payload: { zoneId: "zone-1", status: "safe" },
      status: "stuck",
      stuckReason: "gave_up",
    });
    seed(stuck);
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/outbox/recordCheckIn");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ id: stuck.id, userId: "user-a" });
  });

  it("Retry that delivers removes the entry, and the badge hides (I-2)", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ result: "delivered" }), { status: 200 }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: /couldn't send|waiting to send/ })).toBeNull()
    );
    expect(JSON.parse(localStorage.getItem(OUTBOX_KEY)!)).toEqual([]);
  });

  it("closes its dialog when the list empties, and the next write shows the badge with the dialog still closed (I-3)", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    const pending = entry({ userId: "user-a", status: "pending" });
    seed(pending);
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 waiting to send" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Delivered while the resident is looking at the list.
    await act(async () => {
      seed();
      window.dispatchEvent(new Event("weatherwell:outbox-changed"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /waiting to send/ })).toBeNull();

    // The next write brings the badge back, and nothing pops up over the
    // screen the resident is using.
    await act(async () => {
      seed(entry({ userId: "user-a", status: "pending" }));
      window.dispatchEvent(new Event("weatherwell:outbox-changed"));
    });
    expect(screen.getByRole("button", { name: "1 waiting to send" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes its dialog when the last stuck entry is discarded, and the next write keeps it closed (I-3)", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => {
      seed(entry({ userId: "user-a", status: "pending" }));
      window.dispatchEvent(new Event("weatherwell:outbox-changed"));
    });
    expect(screen.getByRole("button", { name: "1 waiting to send" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("Discard", () => {
    it("asks for confirmation inline, in the same dialog, and only removes the entry when confirmed", async () => {
      const user = userEvent.setup();
      auth.set("user-a");
      seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
      renderWithData(<OutboxBadge />);
      await user.click(screen.getByRole("button", { name: "1 couldn't send" }));
      expect(screen.getAllByRole("dialog")).toHaveLength(1);

      await user.click(screen.getByRole("button", { name: "Discard" }));
      // Still exactly one dialog — the confirmation replaced the row's own
      // controls in place rather than opening a second modal on top.
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByText("Discard this? It won't be sent.")).toBeInTheDocument();

      // Cancel keeps the entry, with a single unambiguous "Discard" query.
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "1 couldn't send" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
      expect((JSON.parse(localStorage.getItem(OUTBOX_KEY)!) as OutboxEntry[])).toHaveLength(1);

      // Confirming removes it, and the badge is hidden again.
      await user.click(screen.getByRole("button", { name: "Discard" }));
      await user.click(screen.getByRole("button", { name: "Discard" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("button", { name: /couldn't send|waiting to send/ })).toBeNull();
      expect((JSON.parse(localStorage.getItem(OUTBOX_KEY)!) as OutboxEntry[])).toHaveLength(0);
    });

    it("moves focus to the inline Confirm button, and back to Discard on cancel", async () => {
      const user = userEvent.setup();
      auth.set("user-a");
      seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
      renderWithData(<OutboxBadge />);
      await user.click(screen.getByRole("button", { name: "1 couldn't send" }));

      const discardButton = screen.getByRole("button", { name: "Discard" });
      await user.click(discardButton);
      expect(screen.getByRole("button", { name: "Discard" })).toHaveFocus();

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByRole("button", { name: "Discard" })).toHaveFocus();
    });
  });

  it("puts the status text in an aria-live=\"polite\" region", () => {
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "pending" }));
    renderWithData(<OutboxBadge />);
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe("1 waiting to send");
  });

  it("gives its buttons — including the inline discard confirm/cancel — the app's 44px touch-target size", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
    renderWithData(<OutboxBadge />);

    const trigger = screen.getByRole("button", { name: "1 couldn't send" });
    expect(trigger.className).toMatch(/h-11/);

    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Retry" }).className).toMatch(/h-11/);
    expect(screen.getByRole("button", { name: "Discard" }).className).toMatch(/h-11/);

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("button", { name: "Discard" }).className).toMatch(/h-11/);
    expect(screen.getByRole("button", { name: "Cancel" }).className).toMatch(/h-11/);
  });

  it("ignores held entries and other users' entries even when counting a mix", () => {
    auth.set("user-a");
    seed(
      entry({ userId: "user-a", status: "pending" }),
      entry({ userId: "user-a", status: "held" }),
      entry({ userId: "user-b", status: "pending" }),
      entry({ userId: "user-b", status: "stuck", stuckReason: "gave_up" })
    );
    renderWithData(<OutboxBadge />);
    expect(screen.getByRole("button", { name: "1 waiting to send" })).toBeInTheDocument();
  });

  it("shows the stuck count (amber) when one user has both pending and stuck entries, and lists both in the dialog", async () => {
    const user = userEvent.setup();
    auth.set("user-a");
    seed(
      entry({ userId: "user-a", status: "pending", payload: { zoneId: "zone-1", depthLevel: "knee" } }),
      entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" })
    );
    renderWithData(<OutboxBadge />);

    const trigger = screen.getByRole("button", { name: "1 couldn't send" });
    expect(trigger).toHaveAttribute("data-state", "stuck");

    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Will send when online")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Couldn't send: Tried many times without success.")
    ).toBeInTheDocument();
  });
});
