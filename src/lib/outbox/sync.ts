"use client";

/**
 * The Background Sync API (`registration.sync`) is not in TypeScript's DOM
 * lib — Chromium ships it, but it is not a standardized interface — so it is
 * declared locally rather than cast through `any`. Only the one method this
 * module calls is described.
 */
interface SyncCapableRegistration extends ServiceWorkerRegistration {
  sync?: { register(tag: string): Promise<void> };
}

/**
 * Wakes the service worker to drain the queue, called right after every
 * `enqueue` commit (see `outbox.ts`) — the page-open send path already runs
 * from `session-drain.ts`; this is what gives a closed tab a chance too.
 *
 * Two paths, matching the design doc's "Three ways to send":
 * - **Background Sync supported** (Chromium, Edge, Samsung Internet):
 *   registers the `"outbox"` tag. The browser guarantees `sw.js`'s `sync`
 *   handler runs — even with every tab closed — the moment connectivity
 *   allows, and throwing from that handler (see sw.js's
 *   `drainOutboxInWorker`) asks for another try later.
 * - **Not supported** (iOS Safari, Firefox): there is no such guarantee, so
 *   this instead posts straight to whichever worker currently controls the
 *   page. If the app is genuinely closed, nothing receives that message —
 *   sending happens the next time it opens (`useOutboxDrain` /
 *   `session-drain.ts`), and the badge is what makes the wait visible.
 *
 * Never throws and returns before either path resolves: a worker that never
 * installed, a browser with neither capability, or no `navigator` at all
 * (SSR, though this module is "use client" and outbox.ts only calls it from
 * the browser) are all silent no-ops. Requesting a background send is
 * best-effort layered on top of the same-page send path, never something a
 * caller must handle failing.
 */
export function requestBackgroundSend(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.ready
    .then((registration) => {
      const sync = (registration as SyncCapableRegistration).sync;
      if (sync) return sync.register("outbox");
      navigator.serviceWorker.controller?.postMessage({ type: "outbox-drain" });
      return undefined;
    })
    .catch(() => {
      // Best-effort — see the module doc above. `navigator.serviceWorker.ready`
      // can reject when no worker ever activates for this page; there is
      // nothing this call can usefully do about that.
    });
}
