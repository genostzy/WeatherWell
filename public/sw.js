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
const VERSION = "v5";

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

const PRECACHED_ROUTES = [
  "/",
  "/evacuation",
  "/report",
  "/map",
  "/admin",
  "/admin/map",
  "/admin/simulation",
];

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
 * A non-ok network response (a 502, say) is treated the same as no network at
 * all when a cached response exists: serve the cache rather than pass the
 * failure through. A backend outage during a storm must not lock a resident
 * out of data already on their device just because the server answered
 * quickly. Only when nothing is cached does the non-ok response go through
 * unchanged — there is nothing better to show.
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

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never interfere with mutations, and leave cross-origin traffic (map tiles,
  // any future third-party call) to the network untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

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

  // Everything else under /api/. Named explicitly so no API response can fall
  // through to the asset cache — the next plan adds /api/check-ins, where a
  // shared cache would serve one resident's response to another.
  if (url.pathname.startsWith("/api/")) {
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
