# V0 offline sending — design

**Status:** approved in conversation (three sections), 15–16 September 2026.
**Branch:** v0. **Constraints:** free; no new accounts; residents stay anonymous until their first write.

This is the last piece of V0 "Done when: the app works fully offline on real seeded data".

## Why

Today every queued write lives in `localStorage` (`weatherwell.outbox`) and is sent only while a page is open. The service worker can read neither `localStorage` nor Server Actions, so:
- a report filed in a dead zone waits until the app is reopened;
- failed writes retry forever;
- residents cannot see that anything is waiting;
- the queue's timestamps are lost: `water_level_reports.reported_at` and `evacuation_check_ins.checked_in_at` default to arrival time. A 2 AM "waist-deep" that sends at 8 AM would look current.

Two shared-phone seams from the officials-and-roles plan are closed here:
- held entries are shown as the current person's own;
- a cross-tab account change can stamp the wrong owner.

The third seam, the unowned first write, stays accepted.

## 1. Where the queue lives, and who sends it

- **Storage: IndexedDB for the worker, with the page's synchronous copy kept.** *(Amended during planning, 16 September 2026.)*
  - The service worker reads and writes IndexedDB database `weatherwell`, object store `outbox`, keyed by entry id.
  - The page keeps its existing synchronous `localStorage` queue, because 13 call sites rely on `enqueue` and `readOutbox` being synchronous, including the report page's "couldn't save" error.
  - Every page change is mirrored into IndexedDB. Every worker change is written to IndexedDB and broadcast (`BroadcastChannel("weatherwell-outbox")`) so an open page applies it at once. On load the page reconciles the two copies by id, using an `updatedAt` stamp.
  - When it is impossible to tell whether an entry was delivered by the worker or never mirrored, the entry is **sent again**. That is always safe, because every write is idempotent by its id.
  - This replaces the original "copy localStorage into IndexedDB, then remove it" step; there is nothing to migrate away from.
- **The entry shape stays** `id`, `operation`, `payload`, `queuedAt`, `attempts`, `userId`, plus these new fields:
  - `status: "pending" | "stuck" | "held"`, which replaces the boolean `permanentlyFailed`;
  - `nextAttemptAt: string | null`;
  - `lastError?: string`;
  - `stuckReason?: "permanent" | "too_old" | "gave_up"`.
- **The public queue API stays** `enqueue`, `readOutbox`, `useOutbox`, `markDelivered`, `markFailed` and `claimUnattributed`, with the same meaning for existing callers.
  - They stay synchronous against the page's copy. `useOutbox` re-renders on a local change or on a `BroadcastChannel("weatherwell-outbox")` message from the worker, so components do not change.
  - `enqueue` still throws `OutboxWriteFailed` when the entry cannot be persisted.
- **Three ways to send:**
  1. **Page open:** as today, right after a write, on `online`, and on load.
  2. **App closed, where Background Sync is supported** (Chromium on Android, Edge, Samsung Internet): after every enqueue the page calls `registration.sync.register("outbox")`. The worker's `sync` event sends the queue, and throwing from the handler lets the browser retry later.
  3. **No Background Sync** (iOS Safari, Firefox): sending happens when the app is next opened. The badge makes that visible.
- **Worker endpoints:**
  - `POST /api/outbox/<operation>`, one per operation: `submitWaterLevelReport`, `createPin`, `editPin`, `deleteOwnPin`, `setPinRemoved`, `voteOnPin`, `recordCheckIn`.
  - **Request body:** `{ id, userId, queuedAt, sentAt, payload }`. *(`sentAt` added by the section 2 amendment below.)*
  - **Behaviour:** each route authenticates with `createSupabaseUserClient()` + `getClaims()` (never `getSession()`) and then imports and calls the existing Server Action function directly (an ordinary async function on the server). There is still one implementation of every rule. *(Amended during planning: no separate shared modules are needed.)*
  - **Responses:**

    | Status | Body | When |
    |---|---|---|
    | `200` | `{ result: "delivered" }` | written, or already written under that id |
    | `409` | `{ result: "held" }` | `userId` is not the signed-in user |
    | `401` | `{ result: "signed_out" }` | no session |
    | `422` | `{ result: "permanent", reason }` | will never succeed |
    | `503` | `{ result: "retry" }` | temporary |

  - All responses are `Cache-Control: no-store`.
  - The worker treats `401` like held: it leaves the entry for the page.
- **The page drains through the same endpoints** (not the Server Actions), so page and worker behave identically. Server Actions remain for direct, non-queued calls.
- **Ownership is checked by the server,** whose session is always current. That closes the cross-tab seam. The worker sends only entries with a non-null `userId`, never creates a session, and never deletes a held entry.
- **An unowned first write** (`userId: null`, queued before any account exists) is sent only by the page. The page creates the anonymous session and claims unowned entries, as today.

## 2. Honest timestamps, retries, clean-up

**Honest time, enforced in the database.** One migration adds a `BEFORE INSERT OR UPDATE` trigger on each table:

- **`water_level_reports`:**
  - Clients may supply `reported_at`. Grant INSERT on that column to `authenticated` if column grants currently exclude it.
  - A `reported_at` later than `now()` is set to `now()`.
  - One more than 6 hours before `now()` raises SQLSTATE `22023` with the message `report too old`.
  - With no value supplied, it stays `now()`.
- **`evacuation_check_ins`:**
  - Clients may supply `checked_in_at`, and a future value is clamped to `now()`. There is no age limit, because a late check-in is still true.
  - The existing upsert on `(zone_id, user_id)` must never let an older check-in overwrite a newer one. An update whose incoming `checked_in_at` is earlier than the stored one keeps the stored row unchanged and is treated as delivered.
- **Unchanged:** pins, votes and moderation keep arrival time.
- **Server functions** pass `queuedAt` as `reported_at` / `checked_in_at`. The `22023 report too old` error maps to `422 { result: "permanent", reason: "too_old" }`.

> **Amendment (final review, ruling R6).** `queuedAt` is the device's own clock, and a cheap phone's clock can be hours or days wrong after a flat battery. Passed straight through, a phone more than 6 hours slow could never file a report, and a slow clock could let a stale check-in be treated as older than a fresher one and silently kept out. So the device's absolute clock is no longer trusted:
> - Page and worker both add `sentAt` (the device's clock at the moment of sending) to the request body.
> - The route passes `madeAt = serverNow − max(0, sentAt − queuedAt)` as `reported_at` / `checked_in_at`. Only the elapsed interval, measured on one clock, is trusted. A negative interval counts as zero.
> - A missing or invalid `sentAt` falls back to arrival time (server now), which is how writes were dated before this feature.
> - An invalid `queuedAt` is refused as `422 { result: "permanent", reason: "invalid" }` rather than retried.
> - The triggers are unchanged. Pins, votes and moderation still keep arrival time.

**Retries, in one pure module (`src/lib/outbox/schedule.ts`):**
- **Backoff:** after a temporary failure, `nextAttemptAt` = now + 0, 1, 5, 15, 60 minutes for attempts 1–5, then 60 minutes.
- **Giving up:** after 10 attempts, or 3 days since `queuedAt`, the status becomes `stuck` with `stuckReason: "gave_up"`.
- **Permanent refusals:** a `422` becomes `stuck` at once, with `stuckReason: "permanent"` or `"too_old"` and the reason text.
- **Who sends:** a drain, from the page or the worker, sends only `pending` entries whose `nextAttemptAt` has passed. **Retry** on a stuck entry resets `attempts` to 0, `status` to `pending` and `nextAttemptAt` to now.
- **Clean-up:**
  - `markDelivered` deletes the entry.
  - A `200` for an id not in the queue is ignored.
  - `stuck` entries older than 7 days (from `queuedAt`) are deleted on the next drain.
  - `held` entries are never auto-deleted.

**Held entries.** A `409` sets `status: "held"`. When a drain runs as the entry's owner again, held entries owned by that user return to `pending`.

## 3. The badge

- **`OutboxBadge`** sits in the root header next to `LanguageToggle`, on every screen, including `/admin`.
  - It counts only entries whose `userId` is the current session user, or `null` on this device (a not-yet-signed-in resident's own first write).
  - It is hidden at 0.
- **Labels:**

  | State | English | Filipino |
  |---|---|---|
  | pending | "{n} waiting to send" | "{n} naghihintay na maipadala" |
  | any stuck (amber) | "{n} couldn't send" | "{n} hindi naipadala" |

- **Tapping it** opens a dialog listing each counted entry:
  - **Description:** "Water level report — {zone}, {depth}" / "Ulat ng lalim ng tubig — {zone}, {depth}"; "Check-in — {zone}" / "Check-in — {zone}"; "Pin" / "Pin"; "Vote on a pin" / "Boto sa pin"; "Pin moderation" / "Pag-moderate ng pin".
  - **The time it was made.**
  - **Status:**
    - "Will send when online" / "Ipapadala kapag may koneksyon"
    - "Sending…" / "Ipinapadala…"
    - "Couldn't send: {reason}" / "Hindi naipadala: {reason}"
  - **`too_old` reason text:** "Too old to send — report again if it's still flooded." / "Masyadong luma para ipadala — mag-ulat muli kung may baha pa."
  - **`gave_up` reason text:** "Tried many times without success." / "Sinubukan nang maraming beses nang walang tagumpay."
- **Stuck entries** show **Retry** / "Subukang muli" and **Discard** / "Huwag ipadala". Discard asks "Discard this? It won't be sent." / "Huwag ipadala? Hindi ito ipapadala." before deleting.
- **Accessibility:** status changes are announced (`aria-live="polite"`), and buttons meet the existing 44 px touch target.
- **Existing consumers** of `useOutbox()` (`admin-map-canvas.tsx`, `community-pin-moderation-panel.tsx`) keep working. Read `stuck` where they read `permanentlyFailed`.

## Service worker

- **`sync` event** with tag `outbox`:
  1. read IndexedDB;
  2. prune stuck entries older than 7 days;
  3. for each due `pending` entry with a non-null `userId`, POST to its endpoint;
  4. apply the result;
  5. broadcast a change.

  If any entry is still due and temporarily failing, throw so the browser reschedules.
- **Message `{ type: "outbox-drain" }`** from the page runs the same routine. It is a fallback trigger for when `sync` is unavailable but the worker is alive.
- **Queue order is respected:** an `editPin` / `deleteOwnPin` / `setPinRemoved` entry is not sent while a `createPin` for the same pin is still queued. That is the rule `assertPinIsNotAwaitingCreate` enforces today.
- **The retry rules exist twice**, in `src/lib/outbox/schedule.ts` and in `public/sw.js`, because the worker is plain JavaScript the app build does not compile. Both are tested against one shared case table, `src/lib/outbox/schedule-cases.json`, so they cannot drift.
- **The worker never:**
  - calls Supabase directly;
  - creates or refreshes a session itself (the route handler's Supabase client refreshes cookies from the refresh token);
  - sends unowned entries;
  - caches `/api/outbox/*`.
- **`VERSION`** is bumped.

## Out of scope

- Periodic Background Sync.
- Photo uploads (pins have no photos in V0).
- Syncing pins/votes/moderation "as of" their queued time.
- A per-device account switcher.

## Testing

- **Queue store** (fake IndexedDB, `fake-indexeddb` if already available, otherwise a minimal in-memory adapter behind the same interface):
  - enqueue, read, deliver, fail;
  - the `localStorage` copy, including an interrupted copy;
  - `OutboxWriteFailed`;
  - a broadcast updates `useOutbox`.
- **`schedule.ts`** (fake clock): the backoff table, the 10-attempt and 3-day give-up, retry reset, and the 7-day prune.
- **Each `/api/outbox/<operation>`:**
  - 200 delivered;
  - 200 on a repeated id;
  - 409 when `userId` differs;
  - 401 signed out;
  - 422 permanent and 422 `too_old`;
  - 503 temporary;
  - `no-store`;
  - uses `getClaims` and never `getSession`.
- **Database suite (`rls.sql`):**
  - a future `reported_at` is clamped;
  - a 7-hour-old report raises `report too old`;
  - a 5-hour-old report is kept with its time;
  - an older check-in does not overwrite a newer one;
  - a late check-in keeps its true time;
  - default times are unchanged when none is supplied.
- **Service worker** (existing harness):
  - `sync` sends only due, owned, pending entries;
  - applies delivered, held, stuck and retry correctly;
  - never calls a session or Supabase URL;
  - throws while something is still due;
  - `/api/outbox/*` is never cached.
- **Badge:**
  - hidden at 0;
  - counts only the current user's and unowned entries, and not held ones;
  - pending versus amber stuck;
  - the list shows each status and reason in both languages;
  - Retry resets;
  - Discard asks and then deletes.
- **Live, on the preview, using a temporary test barangay only** (created and deleted by the test, never zone-1..4):
  1. queue a report offline, close the tab, restore the network, and confirm it arrives with its made-at time (on a Background-Sync-capable browser, or by reopening the page otherwise);
  2. insert a queue entry with a `queuedAt` 7 hours old, and confirm it becomes "couldn't send — too old";
  3. confirm the database ends at its baseline.
