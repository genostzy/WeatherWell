import { describe, it, expect, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithData } from "@/test-utils/render-with-data";
import { rememberSessionUserId } from "@/lib/auth/session-user";
import { formatActionTime } from "@/lib/official-actions-copy";
import { OUTBOX_DB } from "@/lib/outbox/idb";
import type { OutboxEntry } from "@/lib/outbox/types";
import { OutboxBadge } from "./outbox-badge";

const OUTBOX_KEY = "weatherwell.outbox";

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
  rememberSessionUserId(null);
  counter = 0;
});

describe("OutboxBadge", () => {
  it("is hidden when the queue is empty", () => {
    const { container } = renderWithData(<OutboxBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is hidden when the only entries are held, or belong to another user", () => {
    rememberSessionUserId("user-a");
    seed(
      entry({ userId: "user-a", status: "held" }),
      entry({ userId: "user-b", status: "pending" })
    );
    const { container } = renderWithData(<OutboxBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts the current user's entries plus unowned ones", () => {
    rememberSessionUserId("user-a");
    seed(
      entry({ userId: "user-a", status: "pending" }),
      entry({ userId: null, status: "pending" })
    );
    renderWithData(<OutboxBadge />);
    expect(screen.getByRole("button", { name: "2 waiting to send" })).toBeInTheDocument();
  });

  it("shows a stuck entry as 'couldn't send', flagged via a data attribute rather than a colour class", () => {
    rememberSessionUserId("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
    renderWithData(<OutboxBadge />);
    const button = screen.getByRole("button", { name: "1 couldn't send" });
    expect(button).toHaveAttribute("data-state", "stuck");
  });

  it("renders Filipino labels", () => {
    rememberSessionUserId("user-a");
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
    rememberSessionUserId("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
    renderWithData(<OutboxBadge />, { lang: "fil" });
    expect(screen.getByRole("button", { name: "1 hindi naipadala" })).toBeInTheDocument();
  });

  it("lists a counted entry's description, made-at time and status when tapped", async () => {
    const user = userEvent.setup();
    rememberSessionUserId("user-a");
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
    rememberSessionUserId("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "too_old", lastError: "too_old" }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));

    expect(
      screen.getByText(
        "Couldn't send: Too old to send — report again if it's still flooded."
      )
    ).toBeInTheDocument();
  });

  it("shows the gave_up reason text for a gave_up stuck entry", async () => {
    const user = userEvent.setup();
    rememberSessionUserId("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up", lastError: "network" }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));

    expect(
      screen.getByText("Couldn't send: Tried many times without success.")
    ).toBeInTheDocument();
  });

  it("Retry turns the entry pending again, and the badge returns to 'waiting'", async () => {
    const user = userEvent.setup();
    rememberSessionUserId("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByRole("button", { name: "1 waiting to send" })).toBeInTheDocument();
    const [stored] = JSON.parse(localStorage.getItem(OUTBOX_KEY)!) as OutboxEntry[];
    expect(stored.status).toBe("pending");
  });

  it("Discard asks for confirmation, and only removes the entry when confirmed", async () => {
    const user = userEvent.setup();
    rememberSessionUserId("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
    renderWithData(<OutboxBadge />);
    await user.click(screen.getByRole("button", { name: "1 couldn't send" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.getByText("Discard this? It won't be sent.")).toBeInTheDocument();

    // Cancel keeps the entry.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "1 couldn't send" })).toBeInTheDocument();
    expect((JSON.parse(localStorage.getItem(OUTBOX_KEY)!) as OutboxEntry[])).toHaveLength(1);

    // Confirming removes it, and the badge is hidden again.
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(screen.getAllByRole("button", { name: "Discard" })[1]);
    expect(screen.queryByRole("button", { name: /couldn't send|waiting to send/ })).toBeNull();
    expect((JSON.parse(localStorage.getItem(OUTBOX_KEY)!) as OutboxEntry[])).toHaveLength(0);
  });

  it("puts the status text in an aria-live=\"polite\" region", () => {
    rememberSessionUserId("user-a");
    seed(entry({ userId: "user-a", status: "pending" }));
    renderWithData(<OutboxBadge />);
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe("1 waiting to send");
  });

  it("gives its buttons the app's 44px touch-target size", async () => {
    const user = userEvent.setup();
    rememberSessionUserId("user-a");
    seed(entry({ userId: "user-a", status: "stuck", stuckReason: "gave_up" }));
    renderWithData(<OutboxBadge />);

    const trigger = screen.getByRole("button", { name: "1 couldn't send" });
    expect(trigger.className).toMatch(/h-11/);

    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Retry" }).className).toMatch(/h-11/);
    expect(screen.getByRole("button", { name: "Discard" }).className).toMatch(/h-11/);
  });

  it("ignores held entries and other users' entries even when counting a mix", () => {
    rememberSessionUserId("user-a");
    seed(
      entry({ userId: "user-a", status: "pending" }),
      entry({ userId: "user-a", status: "held" }),
      entry({ userId: "user-b", status: "pending" }),
      entry({ userId: "user-b", status: "stuck", stuckReason: "gave_up" })
    );
    renderWithData(<OutboxBadge />);
    expect(screen.getByRole("button", { name: "1 waiting to send" })).toBeInTheDocument();
  });
});
