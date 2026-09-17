/**
 * WeatherWell service worker.
 *
 * The offline promise here is the product, so the caching is deliberately
 * split by what each kind of request is for rather than run through one
 * blanket strategy:
 *
 *   - Pages and code must be able to CHANGE. A resident stuck on an old build
 *     can never receive a fix to the alert logic, which for a flood-warning
 *     app is worse than being briefly offline. These go network-first with a
 *     short timeout, so a good connection gets the current build and a bad one
 *     still falls back to cache almost immediately.
 *   - Build assets under /_next/static are content-hashed: a change produces a
 *     new URL, so serving the old one from cache is never wrong and is the
 *     fastest option available.
 *   - Zone and evacuation data must survive an outage. That is the whole
 *     point, so it stays cache-first / stale-while-revalidate.
 *
 * BUMP `VERSION` ON EVERY DEPLOY. `activate` deletes any cache not named in
 * CURRENT_CACHES, so a bump is what evicts a bad build from installed devices.
 * Leaving it unchanged is what pins users to a stale app forever.
 */
const VERSION = "v11";

const SHELL_CACHE = `weatherwell-shell-${VERSION}`;
const ASSET_CACHE = `weatherwell-assets-${VERSION}`;
const API_CACHE = `weatherwell-api-${VERSION}`;

/**
 * Deliberately NOT versioned. This holds the zone and evacuation data a
 * resident needs during an outage; wiping it on deploy would mean a device
 * that updates and then loses connectivity has nothing to show. Entries are
 * refreshed in the background whenever the device is online.
 */
const ZONE_CACHE = "weatherwell-zones";

const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, API_CACHE, ZONE_CACHE];

/** How long a navigation waits for the network before falling back to cache. */
const NETWORK_TIMEOUT_MS = 3000;

/**
 * How long /api/alerts waits for the network before falling back to cache.
 * Longer than NETWORK_TIMEOUT_MS on purpose: a page falling back early just
 * shows slightly older HTML, but alerts gate the entire app, so a resident on
 * a genuinely slow-but-working connection (a congested cell site during a
 * typhoon, not a dead one) should still get the live network answer rather
 * than be bounced to cache the moment a page would be. 8s is well past normal
 * round-trip time for this API but still short enough that a hung connection
 * (e.g. a captive portal that accepts the TCP connection and never answers)
 * cannot leave the app waiting indefinitely — see the C2 finding.
 */
const ALERTS_TIMEOUT_MS = 8000;

/**
 * API paths known to be safe to cache and share across every requester.
 * Adding a path here is a decision about whether ITS RESPONSE IS PUBLIC —
 * not merely that the route exists — because staleWhileRevalidate below puts
 * whatever comes back into one cache read by every visitor's next request.
 *
 * /api/reports qualifies: it has no per-user variation, is served by the
 * sessionless public client, and its table policy is `select using (true)`.
 *
 * /api/pins qualifies with an argument rather than by inspection, because it
 * IS per-caller: it carries `ownVote`, the caller's own vote direction. The
 * sensitive half of a vote would be "who voted", and that half is already
 * public — pin_votes carries `select using (true)`, the tallies beside every
 * pin are the point of the feature, and the route reads nothing a stranger
 * could not read. What a shared cache can get wrong is only "did *I* vote",
 * and being wrong about that costs a resident one refused duplicate vote (the
 * table's own unique key is the real gate), not a disclosure. Set against a
 * resident during a flood seeing every neighbour's pin with no network, that
 * is the right way round. If ownVote ever gates something that matters, this
 * entry comes out in the same change.
 *
 * Anything NOT listed here goes straight to the network, uncached. That is
 * the safe default when this file does not know whether a response is
 * public — a future endpoint like /api/check-ins is user-scoped, and
 * inheriting a shared cache silently (as the old blanket /api/ rule would
 * have done) is exactly how one resident ends up served another resident's
 * response.
 */
const PUBLIC_API_PATHS = ["/api/reports", "/api/pins"];

// /admin, /admin/map and /admin/simulation are deliberately NOT precached
// here. Once /admin needs a sign-in, pre-downloading it would save the
// sign-in page on every device and serve it back in place of the dashboard.
// An official's own visits are not cached either: see isAdminScoped below.
const PRECACHED_ROUTES = ["/", "/evacuation", "/report", "/map"];

self.addEventListener("install", (event) => {
  // Deliberately not cache.addAll: that is all-or-nothing, so a single route
  // answering non-200 during a deploy would reject, fail the install, and
  // leave the worker inactive — no cache, no fetch handler, no offline
  // support at all, with nothing surfacing the failure. Caching route by
  // route means a bad one costs only itself.
  //
  // /api/zones and /api/alerts are precached here too, into the same caches
  // their fetch branches read from, so a resident who has only ever opened
  // the app once still has zones and evacuation instructions offline —
  // before this, nothing populated either cache until the first *manual*
  // fetch happened to land while the worker already controlled the page.
  // This also repopulates /api/alerts's cache (in the versioned SHELL_CACHE)
  // on every deploy, since install re-runs then and activate had just wiped
  // it.
  event.waitUntil(
    Promise.all([
      caches
        .open(SHELL_CACHE)
        .then((cache) =>
          Promise.all(
            [...PRECACHED_ROUTES, "/api/alerts"].map((route) =>
              cache.add(route).catch(() => undefined)
            )
          )
        ),
      caches.open(ZONE_CACHE).then((cache) => cache.add("/api/zones").catch(() => undefined)),
    ])
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

/**
 * Mirrors isAdminPath in src/lib/auth/admin-path.ts, which this worker cannot
 * import; service-worker.test.ts pins the two together. `/admin` itself or
 * `/admin/` followed by anything — not "/administration".
 */
function isAdminPathname(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Responses that belong to one signed-in official (I1): every /admin page,
 * as a navigation or as the `?_rsc=` flight data a client-side <Link> fetches,
 * and the action record. They carry official names, who did what, and
 * check-in summaries. On a shared family phone — the risk the spec mitigates
 * with Sign out — anything kept here would be served to the next person,
 * offline or on a slow connection, after that sign-out. So they go straight
 * to the network in every branch and are never stored or answered from a
 * store; an official offline sees the browser's own offline page instead.
 */
function isAdminScoped(pathname) {
  return (
    isAdminPathname(pathname) ||
    pathname === "/api/official-actions" ||
    pathname.startsWith("/api/official-actions/")
  );
}

/**
 * Deletes every admin-scoped entry from every cache this origin holds, and
 * nothing else — a resident's offline zone data survives a sign-out. Run when
 * a sign-out is posted. Nothing current writes these entries, so in practice
 * this clears what a device stored under an older worker, and anything a
 * future branch lets slip; the VERSION bump evicts the rest on activate.
 */
function purgeAdminEntries() {
  return caches.keys().then((names) =>
    Promise.all(
      names.map((name) =>
        caches.open(name).then((cache) =>
          cache.keys().then((requests) =>
            Promise.all(
              requests
                .filter((cached) => isAdminScoped(new URL(cached.url, self.location.origin).pathname))
                .map((cached) => cache.delete(cached))
            )
          )
        )
      )
    )
  );
}

function putInCache(cacheName, request, response) {
  // Opaque cross-origin responses report status 0 and are not worth storing.
  if (!response || response.status !== 200) return;
  const clone = response.clone();
  caches.open(cacheName).then((cache) => cache.put(request, clone));
}

/**
 * Network wins when it answers in time; cache covers both a slow network and
 * a dead one. The timeout matters more than usual here — a resident on a
 * degraded connection during a storm should not stare at a blank screen
 * waiting for a request that is never going to arrive.
 *
 * A *server* error (a 502, say) is treated the same as no network at all when
 * a cached response exists: serve the cache rather than pass the failure
 * through. A backend outage during a storm must not lock a resident out of
 * data already on their device just because the server answered quickly.
 * Only when nothing is cached does it go through unchanged — there is nothing
 * better to show.
 *
 * A *client* error passes through untouched, cached copy or not. 4xx is the
 * server's real answer about this URL, and a 404 served as a stale 200 would
 * show a resident a page that no longer exists while reporting success.
 */
function networkFirst(request, cacheName, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (response) => {
      if (!settled && response) {
        settled = true;
        resolve(response);
      }
    };

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            caches.match(request).then(settle);
          }, timeoutMs)
        : null;

    fetch(request)
      .then((response) => {
        if (timer) clearTimeout(timer);
        if (response && response.ok) {
          putInCache(cacheName, request, response);
          settle(response);
          return;
        }
        // A client error is the server's real answer about this URL — a 404
        // means the page is gone. Covering that with a copy the device
        // happens to still hold would flip the status to 200 and show content
        // that no longer exists. Only a server error falls back, because a 502
        // mid-deploy says nothing about whether the resource exists, so what
        // is already on the device is the better answer.
        if (response && response.status < 500) {
          settle(response);
          return;
        }
        caches.match(request).then((cached) => {
          settle(cached || response);
        });
      })
      .catch(() => {
        if (timer) clearTimeout(timer);
        caches.match(request).then((cached) => {
          settled = true;
          resolve(cached || Response.error());
        });
      });
  });
}

/** Serve immediately from cache, refresh in the background for next time. */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

function cacheFirst(request, cacheName) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      putInCache(cacheName, request, response);
      return response;
    });
  });
}

/**
 * Serves a cache-busting refetch on a public API path — a request that
 * carries a query string on an otherwise plain, cacheable pathname (see
 * PUBLIC_API_PATHS). A resident's store issues exactly one of these right
 * after a write is delivered, to collect the row the write just created —
 * the one row a cached copy is guaranteed not to contain.
 *
 * This is deliberately NOT staleWhileRevalidate. That strategy answers from
 * whatever is stored under the REQUEST'S OWN key, and the busting parameter
 * used to BE that key — `?delivered=N`, a counter that restarts at 1 every
 * time the app opens, while this cache survives across sessions. A later
 * session's own `?delivered=1` refetch could land on an EARLIER session's
 * response stored under that exact same key, replacing fresher rows with an
 * old snapshot. Growing the parameter instead (a random value, a timestamp)
 * would dodge that collision only by making the cache grow without bound —
 * a fresh entry, never read again, for every single write.
 *
 * So the busting parameter is treated purely as an instruction — skip the
 * cache, go to the network — and never as part of a cache key. `fetch` is
 * called unconditionally, before any cache read, which is what guarantees
 * requirement 1: when a network exists, this always reaches it. A
 * successful response is stored under `plainUrl`, the SAME key the plain
 * (non-busted) request reads and writes — so the cache gains no new entry
 * per write (requirement 3) and the very next read, whether later in this
 * session or the next session's first mount, sees the fresh rows too
 * (requirement 2). On failure — offline, a timeout, a dead connection — this
 * falls back to whatever is stored under that same plain key: the last known
 * rows, which is what a resident with no signal must still see, on a
 * post-write refetch exactly as on an ordinary read (requirement 4).
 */
function revalidatePlainEntry(request, plainUrl, cacheName) {
  return fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        putInCache(cacheName, plainUrl, response);
        return response;
      }
      // A client error is the server's real answer; a server error mid-write
      // says nothing about whether the rows are gone, so fall back to the
      // last known copy the same way networkFirst does for everything else.
      if (response && response.status < 500) return response;
      return caches.match(plainUrl).then((cached) => cached || response);
    })
    .catch(() => caches.match(plainUrl).then((cached) => cached || Response.error()));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Sign-out is a form POST to /auth/signout from every sign-out control
  // (AdminHeader, NotAppointed, AccountLink). Watching for it here, rather
  // than posting a message from each form, is what actually runs: it needs no
  // client script, so it holds with JS disabled and for any future sign-out
  // form, and it runs exactly when this worker controls the page — the only
  // time these caches exist. The POST itself still goes to the network
  // untouched; this only extends the event to finish the purge.
  if (request.method === "POST" && url.origin === self.location.origin && url.pathname === "/auth/signout") {
    event.waitUntil(purgeAdminEntries());
    return;
  }

  // Never interfere with mutations, and leave cross-origin traffic (map tiles,
  // any future third-party call) to the network untouched.
  if (request.method !== "GET") return;

  if (url.origin !== self.location.origin) return;

  // Sign-in and its callbacks carry one-time codes and set the session.
  // Never stored, and never answered from a store.
  if (url.pathname === "/sign-in" || url.pathname.startsWith("/auth/")) {
    event.respondWith(fetch(request));
    return;
  }

  // An official's pages, their RSC payloads, and the action record: network
  // only, in every mode. See isAdminScoped.
  if (isAdminScoped(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  // Alerts are the one thing that must never be stale when a network exists.
  if (url.pathname === "/api/alerts" || url.pathname.startsWith("/api/alerts/")) {
    event.respondWith(networkFirst(request, SHELL_CACHE, ALERTS_TIMEOUT_MS));
    return;
  }

  // Zone and evacuation data: instant from cache, refreshed behind the scenes.
  if (url.pathname === "/api/zones" || url.pathname.startsWith("/api/zones/")) {
    event.respondWith(staleWhileRevalidate(request, ZONE_CACHE));
    return;
  }

  // Check-ins name a person and say whether they need help. Straight to the
  // network, never stored, never answered from a store. This is deliberately
  // its own branch above the public-API allowlist rather than an omission
  // from that list: an omission would send it to the uncached default, which
  // is the same behaviour today but would silently change the day somebody
  // makes the default cache again.
  if (url.pathname === "/api/check-ins" || url.pathname.startsWith("/api/check-ins/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Everything else under /api/: an explicit allowlist, not a catch-all. Only
  // a path named in PUBLIC_API_PATHS is safe to put in the shared API cache;
  // an unrecognised /api/ path goes straight to the network, uncached, since
  // this file has no way to know whether its response is public. See
  // PUBLIC_API_PATHS above for why that has to be the default.
  if (url.pathname.startsWith("/api/")) {
    const isPublic = PUBLIC_API_PATHS.some(
      (path) => url.pathname === path || url.pathname.startsWith(`${path}/`)
    );
    if (!isPublic) {
      event.respondWith(fetch(request));
      return;
    }

    // A query string on a public API path is a post-write cache-busting
    // refetch, not a distinct resource — see revalidatePlainEntry for why it
    // must never be answered from, or stored under, its own key.
    if (url.search) {
      const plainUrl = `${url.origin}${url.pathname}`;
      event.respondWith(revalidatePlainEntry(request, plainUrl, API_CACHE));
      return;
    }

    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // Content-hashed build output — a change means a new URL, so cache is safe.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Pages. Network-first is what lets a fix actually reach an installed app.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, NETWORK_TIMEOUT_MS));
    return;
  }

  // Icons, manifest, everything else same-origin.
  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});

/**
 * ---------------------------------------------------------------------------
 * Outbox drain (design doc, "Service worker").
 *
 * Sends the IndexedDB-mirrored write queue (src/lib/outbox/idb.ts,
 * OUTBOX_DB/OUTBOX_STORE below) through the same server-checked endpoint the
 * page uses (POST /api/outbox/<operation> — src/lib/outbox/send.ts), so page
 * and worker behave identically. This file is plain JavaScript the app build
 * does not compile, so it cannot import src/lib/outbox/*; everything in this
 * section is a restated copy, kept honest by running the SAME case table,
 * src/lib/outbox/schedule-cases.json, against both copies —
 * service-worker.test.ts runs every row here exactly as schedule.test.ts
 * does against the real module.
 *
 * Hard rules:
 *   - never calls Supabase directly, never creates/refreshes/reads a session
 *     (the route handler's own Supabase client does that from the request's
 *     cookies — `credentials: "same-origin"` below is what carries them);
 *   - never sends an entry with a null (or missing) userId;
 *   - never deletes a held entry;
 *   - never caches /api/outbox/* (already true: a POST never reaches the
 *     fetch handler at all, and a GET to that path falls through the
 *     existing /api/ allowlist below, uncached — see PUBLIC_API_PATHS).
 * ---------------------------------------------------------------------------
 */

const OUTBOX_DB = "weatherwell";
const OUTBOX_STORE = "outbox";
const OUTBOX_CHANNEL = "weatherwell-outbox";

/** Mirrors src/lib/outbox/idb.ts's openOutboxDb, minus its best-effort catch — a failure here is exactly what should make waitUntil reject. */
function openOutboxDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("openOutboxDb: request failed"));
    request.onblocked = () => reject(new Error("openOutboxDb: blocked by another open connection"));
  });
}

function outboxGetAll() {
  return openOutboxDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, "readonly");
        const request = tx.objectStore(OUTBOX_STORE).getAll();
        request.onsuccess = () => {
          db.close();
          resolve(request.result || []);
        };
        request.onerror = () => {
          db.close();
          reject(request.error || new Error("outboxGetAll: request failed"));
        };
      })
  );
}

function outboxDelete(id) {
  return openOutboxDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, "readwrite");
        tx.objectStore(OUTBOX_STORE).delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("outboxDelete: transaction failed"));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error("outboxDelete: transaction aborted"));
        };
      })
  );
}

/**
 * Applies one send outcome to the entry named by `snapshot.id`, but reads
 * the CURRENT row and writes the result in the SAME `readwrite` transaction
 * — no other operation on this store can be interleaved between that read
 * and that write, because a transaction's requests all execute against one
 * consistent snapshot and its effects only become visible to any other
 * transaction (this worker's next drain, or the page's own IndexedDB
 * connection) atomically at `oncomplete`. That is what closes the window a
 * plain "read, await a fetch, write" sequence leaves open: `outboxGetAll`'s
 * snapshot is taken long before the network round trip in `outboxSend`
 * finishes, and without re-reading inside the write's own transaction, a
 * page write landing in that gap (a `discardEntry` delete, a `retryEntry`
 * put) would simply be clobbered by this function writing back a value
 * derived from the stale pre-fetch copy.
 *
 * Three outcomes, in order:
 *  1. The row is gone — the page discarded it, or an earlier settle already
 *     delivered/removed it. Nothing is written, for ANY outcome, including a
 *     late `delivered`: there is nothing left to confirm or retry against.
 *  2. The row's `updatedAt` has moved past `snapshot.updatedAt` — the page
 *     changed it while the POST was in flight (a Retry, a Discard-then-
 *     re-enqueue under a new id would not collide, a hold release, ...).
 *     Its version wins and this write is skipped, UNLESS the outcome is
 *     `delivered`: the write reached the server regardless of what the page
 *     did locally in the meantime, so the row is deleted either way — a
 *     later local edit to an entry that no longer needs sending has nothing
 *     left to apply to.
 *  3. Otherwise (unchanged since the snapshot): apply the outcome exactly as
 *     before.
 *
 * Resolves `{ wrote, deleted, next }`: `wrote` is false for case 1 and for a
 * skipped case 2, so the drain's `changed`/`stillDue` bookkeeping only
 * reacts to a write THIS call actually made — a skipped write already had
 * its own `changed` broadcast from whatever page commit produced the newer
 * `updatedAt`.
 */
function outboxSettleEntry(snapshot, outcome, now) {
  return openOutboxDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, "readwrite");
        const store = tx.objectStore(OUTBOX_STORE);
        const getRequest = store.get(snapshot.id);

        let result = { wrote: false, deleted: false, next: null };

        getRequest.onsuccess = () => {
          const current = getRequest.result;

          // Case 1: gone. Never write it back into existence.
          if (current === undefined) return;

          const movedOn = Date.parse(current.updatedAt) > Date.parse(snapshot.updatedAt);

          // Case 2, non-delivered: the page's version wins.
          if (movedOn && outcome.result !== "delivered") return;

          // Delivered always deletes — case 2's one exception — and it is
          // also the ordinary case-3 "delivered" outcome, since applyOutcome
          // returns null for it either way.
          if (outcome.result === "delivered") {
            store.delete(snapshot.id);
            result = { wrote: true, deleted: true, next: null };
            return;
          }

          // Case 3: unchanged since the snapshot — apply as today, against
          // the freshly-read row (identical to `snapshot` when truly
          // unchanged, but reading `current` costs nothing extra and is the
          // more honest source of truth).
          const next = applyOutcome(current, outcome, now);
          if (next === null) {
            store.delete(snapshot.id);
            result = { wrote: true, deleted: true, next: null };
          } else {
            store.put(next);
            result = { wrote: true, deleted: false, next };
          }
        };
        getRequest.onerror = () => {
          // Left unhandled on purpose: an unhandled request error aborts the
          // transaction per the IndexedDB spec, and tx.onabort below is what
          // turns that into a rejection.
        };

        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("outboxSettleEntry: transaction failed"));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error("outboxSettleEntry: transaction aborted"));
        };
      })
  );
}

/**
 * The retry rules below are a line-for-line restatement of
 * src/lib/outbox/schedule.ts. Any behavioural change there must be copied
 * here too — see the section doc above for how that is enforced.
 */
const OUTBOX_BACKOFF_MINUTES = [0, 1, 5, 15, 60];
const OUTBOX_MAX_ATTEMPTS = 10;
const OUTBOX_GIVE_UP_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const OUTBOX_PRUNE_STUCK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const OUTBOX_DEPENDS_ON_PIN_CREATE = new Set(["editPin", "deleteOwnPin", "setPinRemoved", "voteOnPin"]);

function outboxFindDependencyCreate(entry, queue) {
  if (!OUTBOX_DEPENDS_ON_PIN_CREATE.has(entry.operation)) return undefined;
  const pinId = entry.payload && entry.payload.pinId;
  return queue.find((other) => other.operation === "createPin" && other.id === pinId);
}

function isDue(entry, now) {
  if (entry.status !== "pending") return false;
  return entry.nextAttemptAt === null || Date.parse(entry.nextAttemptAt) <= now.getTime();
}

function applyOutcome(entry, outcome, now) {
  const updatedAt = now.toISOString();

  switch (outcome.result) {
    case "delivered":
      return null;

    case "held":
      return Object.assign({}, entry, { status: "held", nextAttemptAt: null, updatedAt });

    // Left for the page: the worker never creates or refreshes a session, so
    // it cannot tell a genuinely signed-out resident from one whose cookies
    // just have not reached it yet. Never counts toward the attempt cap, but
    // does count toward the 3-day give-up (see schedule.ts).
    case "signed_out": {
      const age = now.getTime() - Date.parse(entry.queuedAt);
      if (age > OUTBOX_GIVE_UP_AFTER_MS) {
        return Object.assign({}, entry, {
          status: "stuck",
          stuckReason: "gave_up",
          lastError: "signed_out",
          nextAttemptAt: null,
          updatedAt,
        });
      }
      return Object.assign({}, entry, { updatedAt });
    }

    case "permanent": {
      const stuckReason = outcome.reason === "too_old" ? "too_old" : "permanent";
      return Object.assign({}, entry, {
        status: "stuck",
        stuckReason,
        lastError: outcome.reason == null ? "permanent" : outcome.reason,
        nextAttemptAt: null,
        updatedAt,
      });
    }

    case "retry": {
      const attempts = entry.attempts + 1;
      const age = now.getTime() - Date.parse(entry.queuedAt);
      if (attempts >= OUTBOX_MAX_ATTEMPTS || age > OUTBOX_GIVE_UP_AFTER_MS) {
        return Object.assign({}, entry, {
          attempts,
          status: "stuck",
          stuckReason: "gave_up",
          lastError: outcome.error,
          nextAttemptAt: null,
          updatedAt,
        });
      }
      const minutes = OUTBOX_BACKOFF_MINUTES[Math.min(attempts - 1, OUTBOX_BACKOFF_MINUTES.length - 1)];
      return Object.assign({}, entry, {
        attempts,
        status: "pending",
        lastError: outcome.error,
        nextAttemptAt: new Date(now.getTime() + minutes * 60000).toISOString(),
        updatedAt,
      });
    }

    default:
      return entry;
  }
}

function shouldPrune(entry, now) {
  return entry.status === "stuck" && now.getTime() - Date.parse(entry.queuedAt) > OUTBOX_PRUNE_STUCK_AFTER_MS;
}

function isBlockedByPendingCreate(entry, queue) {
  const create = outboxFindDependencyCreate(entry, queue);
  return create !== undefined && create.status !== "stuck";
}

function isOrphanedByFailedCreate(entry, queue) {
  const create = outboxFindDependencyCreate(entry, queue);
  return create !== undefined && create.status === "stuck";
}

/** Mirrors src/lib/outbox/send.ts's response mapping exactly. */
function outboxOutcomeFromResponse(response) {
  switch (response.status) {
    case 200:
      return Promise.resolve({ result: "delivered" });
    case 409:
      return Promise.resolve({ result: "held" });
    case 401:
      return Promise.resolve({ result: "signed_out" });
    case 404:
      return Promise.resolve({ result: "permanent", reason: "unknown_operation" });
    case 422:
      return response
        .json()
        .catch(() => ({}))
        .then((body) => ({
          result: "permanent",
          reason: typeof body.reason === "string" ? body.reason : undefined,
        }));
    default:
      return Promise.resolve({ result: "retry" });
  }
}

function outboxSend(entry) {
  return fetch(`/api/outbox/${entry.operation}`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: entry.id,
      userId: entry.userId == null ? null : entry.userId,
      queuedAt: entry.queuedAt,
      // This device's clock now; see src/lib/outbox/send.ts.
      sentAt: new Date().toISOString(),
      payload: entry.payload,
    }),
  })
    .then((response) => outboxOutcomeFromResponse(response))
    .catch(() => ({ result: "retry" }));
}

/**
 * Reason recorded on a dependent write (editPin/deleteOwnPin/setPinRemoved/
 * voteOnPin) whose own pin's createPin has permanently failed — matches
 * src/lib/outbox/drain.ts's PIN_NEVER_CREATED, applied the same way here:
 * without ever sending the request, because isOrphanedByFailedCreate already
 * knows the create is stuck and there is nothing a request could learn.
 */
const OUTBOX_PIN_NEVER_CREATED = { result: "permanent", reason: "pin was never created" };

/**
 * True when `entry` is still owed a send by this worker: it is `pending` and
 * has an owner. Due now, backing off, blocked behind its createPin, or left
 * untouched by a 401 all count; held, stuck and unowned entries do not (a
 * held or unowned entry waits for the page, a stuck one for the resident).
 */
function isOwedASend(entry) {
  return entry.userId != null && entry.status === "pending";
}

/**
 * Runs one drain pass: prune, settle orphaned dependents, send everything
 * else that is due, unblocked and owned, oldest first. Broadcasts a change
 * (if anything changed) and then — this is what keeps Background Sync
 * retrying — re-reads the store and throws whenever any owned `pending`
 * entry remains, whether it is due right now or still backing off.
 *
 * Throwing only for an entry due right now is not enough: the backoff table
 * makes only the FIRST failure due immediately (0 minutes), so a second
 * failure, or a sync that finds nothing but a backing-off entry the page
 * already failed, would resolve, the browser would count the sync as done,
 * and nothing would wake the worker again until the app was reopened. The
 * browser's own sync backoff paces the retries; this worker's per-entry
 * `nextAttemptAt` still decides which entries a pass actually sends.
 *
 * A single `now`, captured once, is used for every decision in the pass
 * (pruning, due-ness, and every applyOutcome call): the worker sees the
 * queue once per drain rather than re-reading it mid-pass the way the page's
 * drain.ts loop does, so one steady clock reading is both simpler and
 * sufficient here.
 */
function drainOutboxInWorker() {
  const now = new Date();

  return outboxGetAll().then((all) => {
    const toPrune = all.filter((entry) => shouldPrune(entry, now));
    const pruneIds = new Set(toPrune.map((entry) => entry.id));
    const remaining = all.filter((entry) => !pruneIds.has(entry.id));

    // A dependent write whose createPin has already given up for good: the
    // pin will never exist, so it is settled as permanent WITHOUT a network
    // call, exactly like the page's drain.ts.
    const orphaned = remaining.filter(
      (entry) => entry.status === "pending" && isOrphanedByFailedCreate(entry, remaining)
    );
    const orphanedIds = new Set(orphaned.map((entry) => entry.id));

    // Never a null/missing userId (I2 — an unowned entry is the page's job to
    // claim before it ever reaches this worker), never blocked behind a
    // still-live createPin, oldest first.
    const due = remaining
      .filter(
        (entry) =>
          entry.userId != null &&
          !orphanedIds.has(entry.id) &&
          isDue(entry, now) &&
          !isBlockedByPendingCreate(entry, remaining)
      )
      .sort((a, b) => Date.parse(a.queuedAt) - Date.parse(b.queuedAt));

    let changed = toPrune.length > 0;

    function settle(entry, outcomePromise) {
      return Promise.resolve(outcomePromise).then((outcome) =>
        outboxSettleEntry(entry, outcome, now).then((result) => {
          // A skipped write (the row is gone, or the page moved it on) makes
          // no change of THIS call's own — see outboxSettleEntry's doc — so
          // it must not flip `changed` on the page's behalf.
          if (result.wrote) changed = true;
        })
      );
    }

    let chain = Promise.all(toPrune.map((entry) => outboxDelete(entry.id)));

    for (const entry of orphaned) {
      chain = chain.then(() => settle(entry, OUTBOX_PIN_NEVER_CREATED));
    }
    for (const entry of due) {
      chain = chain.then(() => settle(entry, outboxSend(entry)));
    }

    return chain
      .then(() => {
        if (changed) {
          const channel = new BroadcastChannel(OUTBOX_CHANNEL);
          channel.postMessage({ type: "changed" });
          channel.close();
        }
        // The store as it is NOW, not this pass's snapshot: the page may have
        // retried, discarded or enqueued something while the pass ran.
        return outboxGetAll();
      })
      .then((after) => {
        if (after.some(isOwedASend)) {
          throw new Error("outbox: an owned entry is still pending after this drain — requesting a reschedule");
        }
      });
  });
}

self.addEventListener("sync", (event) => {
  if (event.tag === "outbox") {
    event.waitUntil(drainOutboxInWorker());
  }
});

// Fallback trigger for when Background Sync is unavailable but the worker is
// alive (design doc, "Message { type: 'outbox-drain' }") — sync.ts posts this
// after every enqueue when registration.sync does not exist.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "outbox-drain") {
    event.waitUntil(drainOutboxInWorker());
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "WeatherWell Alert";
  const body = data.body || "Check your zone for details.";
  const zone = data.zone || "";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { zone },
      actions: [
        { action: "open", title: "Open" },
        { action: "share", title: "Share" },
      ],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "open" || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes("/") && "focus" in client) {
            return client.focus();
          }
        }
        return clients.openWindow("/");
      })
    );
  }
});
