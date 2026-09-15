import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { isAdminPath } from "@/lib/auth/admin-path";

/**
 * public/sw.js runs in a worker, never imported by the app, so it cannot be
 * unit-tested by importing it. Instead it is evaluated in a sandbox with a
 * fake Cache Storage and fetch, and its listeners are driven directly.
 *
 * What is worth pinning down here is the routing: which strategy each kind of
 * request gets. Serving a stale page or a stale script is what strands a
 * resident on a build whose alert logic can no longer be fixed; serving a
 * stale zone during an outage is the entire point of the app. The two must
 * not be confused for each other, which is what these assert.
 */

const ORIGIN = "https://weatherwell.test";

const SW_SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

/**
 * Read from the worker rather than restated here. Bumping VERSION is a routine
 * deploy step, and a suite that broke every time someone did it would train
 * people to distrust it exactly when it matters.
 */
const VERSION = /const VERSION = "([^"]+)"/.exec(SW_SOURCE)?.[1] ?? "";
const SHELL_CACHE = `weatherwell-shell-${VERSION}`;
const ASSET_CACHE = `weatherwell-assets-${VERSION}`;
const API_CACHE = `weatherwell-api-${VERSION}`;
/** Unversioned by design — evacuation data must survive a deploy. */
const ZONE_CACHE = "weatherwell-zones";
/** Read from the worker rather than restated here, same reasoning as VERSION. */
const ALERTS_TIMEOUT_MS = Number(/const ALERTS_TIMEOUT_MS = (\d+)/.exec(SW_SOURCE)?.[1] ?? "0");

interface FakeResponse {
  body: string;
  status: number;
  ok: boolean;
  clone(): FakeResponse;
}

function response(body: string, status = 200): FakeResponse {
  // Mirrors the real Response: `.ok` is derived from status, not a separate
  // field a caller can forget to set — networkFirst's C1 branch reads it.
  return { body, status, ok: status >= 200 && status < 300, clone: () => response(body, status) };
}

function loadServiceWorker(options: {
  caches?: Record<string, Record<string, string>>;
  fetch?: (url: string) => Promise<FakeResponse>;
}) {
  const store = new Map<string, Map<string, string>>();
  for (const [name, entries] of Object.entries(options.caches ?? {})) {
    store.set(name, new Map(Object.entries(entries)));
  }

  const urlOf = (request: { url: string } | string) =>
    typeof request === "string" ? request : request.url;

  function openCache(name: string) {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    return {
      match: async (req: never) => {
        const hit = entries.get(urlOf(req));
        return hit === undefined ? undefined : response(hit);
      },
      put: async (req: never, res: FakeResponse) => {
        entries.set(urlOf(req), res.body);
      },
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      delete: async (req: never) => entries.delete(urlOf(req)),
      addAll: async (urls: string[]) => {
        for (const url of urls) entries.set(url, `precached:${url}`);
      },
      add: async (url: string) => {
        const res = await fetchImpl(url);
        // Mirrors the real Cache.add, which rejects rather than storing a
        // non-ok response — the behaviour the install path has to survive.
        if (res.status !== 200) throw new Error(`bad response for ${url}`);
        entries.set(url, res.body);
      },
    };
  }

  const cacheStorage = {
    open: async (name: string) => openCache(name),
    match: async (req: never) => {
      for (const entries of store.values()) {
        const hit = entries.get(urlOf(req));
        if (hit !== undefined) return response(hit);
      }
      return undefined;
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };

  const listeners: Record<string, (event: unknown) => void> = {};
  const fetchImpl = options.fetch ?? (async () => response("network"));

  const sandbox = {
    self: {
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        listeners[type] = handler;
      },
      skipWaiting: () => {},
      clients: { claim: () => {} },
      location: { origin: "https://weatherwell.test" },
      registration: { showNotification: () => {} },
    },
    caches: cacheStorage,
    fetch: (req: { url: string } | string) => fetchImpl(urlOf(req)),
    Response: { error: () => response("", 0) },
    URL,
    setTimeout,
    clearTimeout,
    clients: { matchAll: async () => [], openWindow: async () => {} },
  };

  vm.createContext(sandbox);
  vm.runInContext(SW_SOURCE, sandbox);

  return { listeners, store, context: sandbox as unknown as Record<string, unknown> };
}

/** Drives the fetch listener and resolves with whatever it responded with. */
async function handleFetch(
  listeners: Record<string, (event: unknown) => void>,
  request: { url: string; method?: string; mode?: string }
): Promise<FakeResponse | undefined> {
  let responded: Promise<FakeResponse> | undefined;
  listeners.fetch({
    request: { method: "GET", mode: "no-cors", ...request },
    respondWith: (value: Promise<FakeResponse>) => {
      responded = value;
    },
  });
  return responded ? await responded : undefined;
}

describe("service worker request routing", () => {
  it("serves a fresh page from the network rather than the cached copy", async () => {
    // The regression this rewrite exists for. Under the previous cache-first
    // rule an installed app kept serving its original build forever, so no
    // fix to alert logic could ever reach a resident's device.
    const { listeners } = loadServiceWorker({
      caches: { [SHELL_CACHE]: { [`${ORIGIN}/`]: "STALE PAGE" } },
      fetch: async () => response("FRESH PAGE"),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/`, mode: "navigate" });

    expect(result?.body).toBe("FRESH PAGE");
  });

  it("falls back to the cached page when the network is gone", async () => {
    // The offline promise. This must keep working, or the product does not.
    const { listeners } = loadServiceWorker({
      caches: { [SHELL_CACHE]: { [`${ORIGIN}/evacuation`]: "CACHED EVACUATION" } },
      fetch: async () => {
        throw new Error("offline");
      },
    });

    const result = await handleFetch(listeners, {
      url: `${ORIGIN}/evacuation`,
      mode: "navigate",
    });

    expect(result?.body).toBe("CACHED EVACUATION");
  });

  it("serves zone data from cache first, so an outage still shows a zone", async () => {
    const { listeners } = loadServiceWorker({
      caches: { [ZONE_CACHE]: { [`${ORIGIN}/api/zones`]: "CACHED ZONES" } },
      fetch: async () => response("NETWORK ZONES"),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/zones` });

    expect(result?.body).toBe("CACHED ZONES");
  });

  it("never serves a stale alert while a network exists", async () => {
    const { listeners } = loadServiceWorker({
      caches: { [SHELL_CACHE]: { [`${ORIGIN}/api/alerts`]: "STALE ALERT" } },
      fetch: async () => response("LIVE ALERT"),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/alerts` });

    expect(result?.body).toBe("LIVE ALERT");
  });

  it("serves hashed build assets from cache without touching the network", async () => {
    let networkCalls = 0;
    const { listeners } = loadServiceWorker({
      caches: {
        [ASSET_CACHE]: { [`${ORIGIN}/_next/static/chunks/abc123.js`]: "CACHED CHUNK" },
      },
      fetch: async () => {
        networkCalls += 1;
        return response("NETWORK CHUNK");
      },
    });

    const result = await handleFetch(listeners, {
      url: `${ORIGIN}/_next/static/chunks/abc123.js`,
    });

    expect(result?.body).toBe("CACHED CHUNK");
    expect(networkCalls).toBe(0);
  });

  it("ignores cross-origin requests entirely", async () => {
    // Map tiles come from OpenStreetMap. Intercepting them would put this
    // worker in the path of traffic it has no business caching.
    const { listeners } = loadServiceWorker({});

    const result = await handleFetch(listeners, {
      url: "https://tile.openstreetmap.org/10/512/512.png",
    });

    expect(result).toBeUndefined();
  });

  it("ignores non-GET requests", async () => {
    const { listeners } = loadServiceWorker({});

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/report`, method: "POST" });

    expect(result).toBeUndefined();
  });

  it("serves a cached alert when the network answers with a non-ok status (C1)", async () => {
    // The 3am-Supabase-pauses scenario: the network is reachable and answers
    // fast, but with a 502, not a rejection. A resident who has a cached
    // alert must see it rather than the failure card. Without the C1 fix
    // (fetch's .then unconditionally settles on whatever it got, ok or not),
    // this test fails and the network's 502 body comes back instead.
    const { listeners } = loadServiceWorker({
      caches: { [SHELL_CACHE]: { [`${ORIGIN}/api/alerts`]: "CACHED ALERT" } },
      fetch: async () => response("Bad Gateway", 502),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/alerts` });

    expect(result?.body).toBe("CACHED ALERT");
  });

  it("lets a genuine 404 through instead of masking it with a stale cached page", async () => {
    // The C1 fix made networkFirst fall back to cache on any non-ok response,
    // and navigations share that function — so a route that was removed
    // between deploys kept serving its old page, status silently flipped from
    // 404 to 200. A client error is the server's real answer about a URL;
    // covering it with a copy the resident happens to still hold is a lie.
    const { listeners } = loadServiceWorker({
      caches: { [SHELL_CACHE]: { [`${ORIGIN}/removed-page`]: "STALE PAGE" } },
      fetch: async () => response("Not Found", 404),
    });

    const result = await handleFetch(listeners, {
      url: `${ORIGIN}/removed-page`,
      mode: "navigate",
    });

    expect(result?.status).toBe(404);
    expect(result?.body).toBe("Not Found");
  });

  it("still falls back to the cached page on a server error, which is transient", async () => {
    // The other side of the same condition, and the reason it is 500 rather
    // than "any non-ok": a 502 mid-deploy says nothing about whether the page
    // exists, so the copy on the device is the better answer.
    const { listeners } = loadServiceWorker({
      caches: { [SHELL_CACHE]: { [`${ORIGIN}/evacuation`]: "CACHED EVACUATION" } },
      fetch: async () => response("Bad Gateway", 502),
    });

    const result = await handleFetch(listeners, {
      url: `${ORIGIN}/evacuation`,
      mode: "navigate",
    });

    expect(result?.body).toBe("CACHED EVACUATION");
  });

  it("passes a non-ok alert response through when nothing is cached", async () => {
    // The other half of C1: there is nothing better to show, so the route
    // must not invent a success. The gate in provider.tsx relies on seeing
    // the real non-ok status here.
    const { listeners } = loadServiceWorker({
      fetch: async () => response("Bad Gateway", 502),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/alerts` });

    expect(result?.status).toBe(502);
    expect(result?.body).toBe("Bad Gateway");
  });

  it("falls back to a cached alert once the network hangs past ALERTS_TIMEOUT_MS (C2)", async () => {
    // A stalled-but-open connection (a captive portal, a congested cell site)
    // never rejects and never resolves. Before the fix, timeoutMs was 0 for
    // this route, so no timer ever fired and the gate hung in "loading"
    // forever with no retry button.
    vi.useFakeTimers();
    try {
      const { listeners } = loadServiceWorker({
        caches: { [SHELL_CACHE]: { [`${ORIGIN}/api/alerts`]: "CACHED ALERT" } },
        fetch: () => new Promise(() => {}),
      });

      const resultPromise = handleFetch(listeners, { url: `${ORIGIN}/api/alerts` });
      await vi.advanceTimersByTimeAsync(ALERTS_TIMEOUT_MS);
      const result = await resultPromise;

      expect(result?.body).toBe("CACHED ALERT");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never puts an API response in the asset cache", async () => {
    // The catch-all was written when no /api/ route existed. Community data
    // and, in the next plan, per-person check-ins must not land in the
    // shared asset cache just because they missed the two named branches.
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("PINS"),
    });

    await handleFetch(listeners, { url: `${ORIGIN}/api/pins` });

    expect(store.has(ASSET_CACHE)).toBe(false);
  });

  it("sends an unrecognised /api/ path straight to the network, uncached", async () => {
    // The allowlist inversion: /api/ used to be a catch-all into the shared
    // API_CACHE, which a future user-scoped endpoint (/api/check-ins) would
    // silently inherit. An unlisted path must not land in ANY cache — not
    // just avoid the asset cache, the point of the test above, but avoid
    // being cached at all.
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("CHECK-IN DATA"),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/check-ins` });

    expect(result?.body).toBe("CHECK-IN DATA");
    expect(store.has(API_CACHE)).toBe(false);
    expect(store.size).toBe(0);
  });

  it("sends /api/health straight to the network, uncached — the monitor must see live status, never a stale cache entry", async () => {
    // /api/health is not in PUBLIC_API_PATHS, so it already falls under the
    // allowlist-inversion rule above. This test pins that specifically for
    // the health endpoint the uptime monitor polls: nothing about the app
    // being cached-and-offline should ever read back as "healthy".
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response('{"status":"ok","database":"ok","recentErrors":0}'),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/health` });

    expect(result?.body).toBe('{"status":"ok","database":"ok","recentErrors":0}');
    expect(store.size).toBe(0);
  });

  it("still caches /api/reports, the allowlisted public API path", async () => {
    // The other half of the allowlist: a path that IS named must keep
    // getting the stale-while-revalidate treatment it had under the old
    // catch-all, so the inversion doesn't quietly regress the one endpoint
    // it exists to keep working.
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("REPORTS"),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/reports` });

    expect(result?.body).toBe("REPORTS");
    expect(store.get(API_CACHE)?.has(`${ORIGIN}/api/reports`)).toBe(true);
  });

  it("never writes a check-in response to any cache", async () => {
    // A check-in names a person and says whether they need help. RLS scopes
    // the rows; it cannot stop a shared cache handing one device's response
    // to another. This is the one route in the app that must not be stored.
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("CHECK-IN DATA"),
    });

    await handleFetch(listeners, { url: `${ORIGIN}/api/check-ins` });

    expect(store.size).toBe(0);
  });

  it("does not answer a check-in request from cache even when one is present", async () => {
    // The dangerous direction is the read, not the write: a response sitting
    // in API_CACHE — the cache the generic /api/ allowlist branch reads from
    // — must not be served for this path. Seeding that specific cache, not
    // some cache this route could never touch, is what makes this test able
    // to fail: see the report for the break/restore proof that the dedicated
    // branch above is what stops it, not an accident of routing.
    const { listeners } = loadServiceWorker({
      caches: { [API_CACHE]: { [`${ORIGIN}/api/check-ins`]: "STALE" } },
      fetch: async () => response("FRESH CHECK-IN DATA"),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/check-ins` });

    expect(result?.body).not.toBe("STALE");
    expect(result?.body).toBe("FRESH CHECK-IN DATA");
  });

  it("always reaches the network for a post-write refetch, never an earlier session's cached copy under the same busted key (F2)", async () => {
    // The bug: the busting counter (`?delivered=N`) restarts at 1 every time
    // the app opens, but API_CACHE survives across sessions until a VERSION
    // bump. Under the old staleWhileRevalidate routing, a later session's own
    // `?delivered=1` refetch could be answered by an EARLIER session's
    // response stored under that exact key. This is what that collision
    // looks like set up directly: seed the key a prior session would have
    // left behind, and confirm this session's refetch does not read it.
    const { listeners } = loadServiceWorker({
      caches: { [API_CACHE]: { [`${ORIGIN}/api/pins?delivered=1`]: "STALE — AN EARLIER SESSION'S SNAPSHOT" } },
      fetch: async () => response("FRESH — THIS SESSION'S OWN WRITE"),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/pins?delivered=1` });

    expect(result?.body).toBe("FRESH — THIS SESSION'S OWN WRITE");
  });

  it("stores a post-write refetch's fresh response under the PLAIN url, not the busted one (F2)", async () => {
    // The plain url is the key the NEXT app launch reads (the mount fetch
    // carries no query string). Storing under the busted key only, the way
    // staleWhileRevalidate naturally would, leaves the plain entry holding
    // the pre-delivery body until something else refreshes it.
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("FRESH REPORTS"),
    });

    await handleFetch(listeners, { url: `${ORIGIN}/api/reports?delivered=1` });

    expect(store.get(API_CACHE)?.get(`${ORIGIN}/api/reports`)).toBe("FRESH REPORTS");
  });

  it("does not grow the API cache with every write (F2)", async () => {
    // A random or ever-incrementing busting value would fix the staleness
    // bug above only by leaving a new, never-read cache entry behind for
    // every single write. Two refetches (different N, as two real writes in
    // one session would produce) must still leave exactly one pins entry.
    let call = 0;
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response(`ROW ${++call}`),
    });

    await handleFetch(listeners, { url: `${ORIGIN}/api/pins?delivered=1` });
    const sizeAfterFirstWrite = store.get(API_CACHE)?.size ?? 0;

    await handleFetch(listeners, { url: `${ORIGIN}/api/pins?delivered=2` });
    const sizeAfterSecondWrite = store.get(API_CACHE)?.size ?? 0;

    expect(sizeAfterSecondWrite).toBe(sizeAfterFirstWrite);
    // And it is the latest write's row under the plain key, not the first's.
    expect(store.get(API_CACHE)?.get(`${ORIGIN}/api/pins`)).toBe("ROW 2");
  });

  it("falls back to the last known rows on both a normal read and a post-write refetch while offline (F2)", async () => {
    // A resident with no signal must still see their neighbours' reports —
    // on an ordinary mount AND on the refetch that follows their own queued
    // write finally being delivered over a connection that then drops again.
    const { listeners } = loadServiceWorker({
      caches: { [API_CACHE]: { [`${ORIGIN}/api/reports`]: "LAST KNOWN REPORTS" } },
      fetch: async () => {
        throw new Error("offline");
      },
    });

    const normalRead = await handleFetch(listeners, { url: `${ORIGIN}/api/reports` });
    expect(normalRead?.body).toBe("LAST KNOWN REPORTS");

    const postWriteRefetch = await handleFetch(listeners, {
      url: `${ORIGIN}/api/reports?delivered=1`,
    });
    expect(postWriteRefetch?.body).toBe("LAST KNOWN REPORTS");
  });

  it("keeps serving zones from the unversioned zone cache", async () => {
    // The one cache deliberately exempt from version bumps, so a device that
    // updates and then loses signal keeps its evacuation instructions. This
    // is only true if the /api/zones branch is the one that actually serves
    // the request — store.has(ZONE_CACHE) alone is seeded true before any
    // fetch runs and proves nothing about which branch handled it, so pin
    // both the served body and that the generic /api/ branch never ran.
    const { listeners, store } = loadServiceWorker({
      caches: { [ZONE_CACHE]: { [`${ORIGIN}/api/zones`]: "CACHED ZONES" } },
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/api/zones` });

    expect(result?.body).toBe("CACHED ZONES");
    expect(store.has(API_CACHE)).toBe(false);
  });

  it("never writes a callback navigation to any cache", async () => {
    // /auth/callback carries a one-time code and sets the session cookie.
    // Storing its response would mean a second visitor to that exact URL (or
    // this same device navigating back) could be served someone else's
    // callback page from a shared cache.
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("CALLBACK PAGE"),
    });

    await handleFetch(listeners, {
      url: `${ORIGIN}/auth/callback?code=x`,
      mode: "navigate",
    });

    expect(store.size).toBe(0);
  });

  it("does not fall back to a cached callback response when the network fails (proves the bypass, not just a fast network)", async () => {
    // A fast, successful network answer would look the same whether this
    // route bypasses the cache entirely or goes through the ordinary
    // networkFirst(SHELL_CACHE) path — both return the fresh response. The
    // two only diverge when the network FAILS: networkFirst falls back to
    // whatever is cached, while the dedicated bypass (plain `fetch(request)`,
    // no fallback) has nothing to fall back to. Seeding SHELL_CACHE — the
    // cache the navigation branch would otherwise read from — and then
    // failing the network is what makes this test able to catch the branch
    // going missing; see the report for the break/restore proof.
    const { listeners } = loadServiceWorker({
      caches: { [SHELL_CACHE]: { [`${ORIGIN}/auth/callback?code=x`]: "STALE CALLBACK" } },
      fetch: async () => {
        throw new Error("offline");
      },
    });

    await expect(
      handleFetch(listeners, { url: `${ORIGIN}/auth/callback?code=x`, mode: "navigate" })
    ).rejects.toThrow();
  });

  it("never writes a /sign-in navigation to any cache", async () => {
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("SIGN-IN PAGE"),
    });

    await handleFetch(listeners, { url: `${ORIGIN}/sign-in`, mode: "navigate" });

    expect(store.size).toBe(0);
  });

  it("does not fall back to a cached /sign-in response when the network fails (proves the bypass, not just a fast network)", async () => {
    // Same reasoning as the callback case above: only a failed network tells
    // networkFirst's cache fallback apart from this route's dedicated bypass.
    const { listeners } = loadServiceWorker({
      caches: { [SHELL_CACHE]: { [`${ORIGIN}/sign-in`]: "STALE SIGN-IN" } },
      fetch: async () => {
        throw new Error("offline");
      },
    });

    await expect(
      handleFetch(listeners, { url: `${ORIGIN}/sign-in`, mode: "navigate" })
    ).rejects.toThrow();
  });
});

describe("service worker install", () => {
  it("still caches every other route when one of them fails", async () => {
    // cache.addAll is all-or-nothing: one route answering non-200 during a
    // deploy would reject, fail the install, and leave the worker inactive —
    // no cache, no fetch handler, no offline support, and nothing surfacing
    // the failure. A bad route must cost only itself.
    //
    // /map is the route made to fail (rather than a removed /admin* entry,
    // which the fetch fake would never even see once those are gone from
    // PRECACHED_ROUTES — see the R7 ruling in the task brief). The floor is
    // 4: PRECACHED_ROUTES now has 4 entries plus /api/alerts is precached
    // alongside them, one of those 5 attempts (/map) fails, leaving 4.
    const { listeners, store } = loadServiceWorker({
      fetch: async (url) => (url === "/map" ? response("boom", 500) : response("ok")),
    });

    const waits: Promise<unknown>[] = [];
    listeners.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);

    const shell = store.get(SHELL_CACHE)!;
    expect(shell.has("/map")).toBe(false);
    expect(shell.has("/")).toBe(true);
    expect(shell.has("/evacuation")).toBe(true);
    expect(shell.size).toBeGreaterThanOrEqual(4);
  });

  it("no longer precaches /admin, /admin/map or /admin/simulation", async () => {
    // Once /admin needs a sign-in, pre-downloading it would save the sign-in
    // page on every device and serve it back in place of the dashboard. This
    // is only about what INSTALL fetches unconditionally for every visitor;
    // an official's own visits are network-only too (see the I1 tests).
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("ok"),
    });

    const waits: Promise<unknown>[] = [];
    listeners.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);

    const shell = store.get(SHELL_CACHE)!;
    expect(shell.has("/admin")).toBe(false);
    expect(shell.has("/admin/map")).toBe(false);
    expect(shell.has("/admin/simulation")).toBe(false);
  });

  it("resolves rather than rejecting when a route fails", async () => {
    // A rejected waitUntil is what aborts the install.
    const { listeners } = loadServiceWorker({
      fetch: async () => {
        throw new Error("offline during install");
      },
    });

    const waits: Promise<unknown>[] = [];
    listeners.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });

    await expect(Promise.all(waits)).resolves.toBeDefined();
  });

  it("precaches zones and alerts, so one prior visit is enough to work offline (I3/I4)", async () => {
    // Before this fix, nothing populated either cache until a manual fetch
    // happened to land after the worker already controlled the page — so a
    // resident who opened the app once in fair weather and next opened it
    // offline got the shell from cache and then the failure card, with no
    // zones and no evacuation instructions.
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("ok"),
    });

    const waits: Promise<unknown>[] = [];
    listeners.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);

    expect(store.get(ZONE_CACHE)?.has("/api/zones")).toBe(true);
    expect(store.get(SHELL_CACHE)?.has("/api/alerts")).toBe(true);
  });

  it("still resolves install when zones or alerts fail to precache", async () => {
    const { listeners, store } = loadServiceWorker({
      fetch: async (url) =>
        url === "/api/zones" || url === "/api/alerts" ? response("boom", 500) : response("ok"),
    });

    const waits: Promise<unknown>[] = [];
    listeners.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });

    await expect(Promise.all(waits)).resolves.toBeDefined();
    expect(store.get(ZONE_CACHE)?.has("/api/zones")).toBe(false);
    expect(store.get(SHELL_CACHE)?.has("/api/alerts")).toBe(false);
    // The routes that did succeed are unaffected by the two that failed.
    expect(store.get(SHELL_CACHE)?.has("/")).toBe(true);
  });
});

describe("service worker cache lifecycle", () => {
  it("evicts caches from older versions on activate", async () => {
    // What makes a version bump able to rescue a device from a bad build.
    const { listeners, store } = loadServiceWorker({
      caches: {
        "weatherwell-v1": { old: "x" },
        "weatherwell-shell-v1": { old: "x" },
        [SHELL_CACHE]: { current: "x" },
      },
    });

    const waits: Promise<unknown>[] = [];
    listeners.activate({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);

    expect(store.has("weatherwell-v1")).toBe(false);
    expect(store.has("weatherwell-shell-v1")).toBe(false);
    expect(store.has(SHELL_CACHE)).toBe(true);
  });

  it("keeps zone data across a version bump", async () => {
    // Zone and evacuation data is content, not code. Wiping it on deploy
    // would leave a device that updated and then lost signal with nothing.
    const { listeners, store } = loadServiceWorker({
      caches: { [ZONE_CACHE]: { [`${ORIGIN}/api/zones`]: "ZONES" } },
    });

    const waits: Promise<unknown>[] = [];
    listeners.activate({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);

    expect(store.has(ZONE_CACHE)).toBe(true);
  });
});

describe("service worker and admin-scoped responses (I1)", () => {
  // An official's pages carry official names, the action record and check-in
  // summaries. On a shared family phone, anything the worker keeps from them
  // is readable by the next person to open the app — so these are
  // network-only, never stored, and never answered from a store.

  it("never writes an /admin navigation to any cache", async () => {
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("ADMIN PAGE"),
    });

    await handleFetch(listeners, { url: `${ORIGIN}/admin/history`, mode: "navigate" });
    await handleFetch(listeners, { url: `${ORIGIN}/admin`, mode: "navigate" });

    expect(store.size).toBe(0);
  });

  it("does not answer an /admin navigation from a cached copy when the network fails", async () => {
    // The shared-phone case itself: offline, a resident types /admin/history.
    const { listeners } = loadServiceWorker({
      caches: { [SHELL_CACHE]: { [`${ORIGIN}/admin/history`]: "SOMEONE ELSE'S HISTORY" } },
      fetch: async () => {
        throw new Error("offline");
      },
    });

    await expect(
      handleFetch(listeners, { url: `${ORIGIN}/admin/history`, mode: "navigate" })
    ).rejects.toThrow();
  });

  it("never stores an /admin RSC fetch, and never serves one stale", async () => {
    // Client-side <Link> navigation fetches `?_rsc=` flight data, which the
    // catch-all branch used to put in the asset cache stale-while-revalidate.
    const { listeners, store } = loadServiceWorker({
      caches: { [ASSET_CACHE]: { [`${ORIGIN}/admin/zone/zone-1?_rsc=abc`]: "PREVIOUS VISIT" } },
      fetch: async () => response("FRESH FLIGHT DATA"),
    });

    const result = await handleFetch(listeners, { url: `${ORIGIN}/admin/zone/zone-1?_rsc=abc` });

    expect(result?.body).toBe("FRESH FLIGHT DATA");
    expect(store.get(ASSET_CACHE)?.get(`${ORIGIN}/admin/zone/zone-1?_rsc=abc`)).toBe("PREVIOUS VISIT");
    expect(store.get(ASSET_CACHE)?.size).toBe(1);
  });

  it("sends /api/official-actions straight to the network, never stored or served from a store", async () => {
    const { listeners, store } = loadServiceWorker({
      caches: { [API_CACHE]: { [`${ORIGIN}/api/official-actions?zone=zone-1&kind=alert&limit=1`]: "STALE RECORD" } },
      fetch: async () => {
        throw new Error("offline");
      },
    });

    await expect(
      handleFetch(listeners, { url: `${ORIGIN}/api/official-actions?zone=zone-1&kind=alert&limit=1` })
    ).rejects.toThrow();
    expect(store.get(API_CACHE)?.size).toBe(1);
  });

  it("matches admin paths exactly as isAdminPath does (sw.js cannot import it)", () => {
    const { context } = loadServiceWorker({});
    const isAdminPathname = context.isAdminPathname as (path: string) => boolean;
    const paths = ["/admin", "/admin/", "/admin/history", "/admin/zone/zone-1", "/administration", "/admin-help", "/", "/map"];

    for (const path of paths) {
      expect(isAdminPathname(path), path).toBe(isAdminPath(path));
    }
  });

  it("still caches an ordinary page whose name merely starts with 'admin'", async () => {
    const { listeners, store } = loadServiceWorker({
      fetch: async () => response("NOT ADMIN"),
    });

    await handleFetch(listeners, { url: `${ORIGIN}/administration`, mode: "navigate" });

    expect(store.get(SHELL_CACHE)?.has(`${ORIGIN}/administration`)).toBe(true);
  });

  it("purges every admin-scoped entry, in every cache, when a sign-out is posted", async () => {
    // Covers devices that stored admin pages before this worker version, and
    // anything a future branch lets slip. Other entries survive: signing out
    // must not cost a resident their offline zone data.
    const { listeners, store } = loadServiceWorker({
      caches: {
        [SHELL_CACHE]: { [`${ORIGIN}/admin/history`]: "HISTORY", [`${ORIGIN}/evacuation`]: "EVACUATION" },
        [ASSET_CACHE]: { [`${ORIGIN}/admin?_rsc=x`]: "FLIGHT", [`${ORIGIN}/icon-192.png`]: "ICON" },
        [API_CACHE]: { [`${ORIGIN}/api/official-actions?limit=1`]: "RECORD" },
        [ZONE_CACHE]: { [`${ORIGIN}/api/zones`]: "ZONES" },
      },
    });

    const waits: Promise<unknown>[] = [];
    listeners.fetch({
      request: { method: "POST", mode: "navigate", url: `${ORIGIN}/auth/signout` },
      respondWith: () => {
        throw new Error("the sign-out POST itself must go to the network untouched");
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);

    expect(waits.length).toBe(1);
    expect(store.get(SHELL_CACHE)?.has(`${ORIGIN}/admin/history`)).toBe(false);
    expect(store.get(ASSET_CACHE)?.has(`${ORIGIN}/admin?_rsc=x`)).toBe(false);
    expect(store.get(API_CACHE)?.has(`${ORIGIN}/api/official-actions?limit=1`)).toBe(false);
    expect(store.get(SHELL_CACHE)?.get(`${ORIGIN}/evacuation`)).toBe("EVACUATION");
    expect(store.get(ASSET_CACHE)?.get(`${ORIGIN}/icon-192.png`)).toBe("ICON");
    expect(store.get(ZONE_CACHE)?.get(`${ORIGIN}/api/zones`)).toBe("ZONES");
  });

  it("evicts the v9 caches, which may already hold admin pages, on activate", async () => {
    const { listeners, store } = loadServiceWorker({
      caches: {
        "weatherwell-shell-v9": { [`${ORIGIN}/admin/history`]: "HISTORY" },
        "weatherwell-assets-v9": { [`${ORIGIN}/admin?_rsc=x`]: "FLIGHT" },
      },
    });

    const waits: Promise<unknown>[] = [];
    listeners.activate({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);

    expect(store.has("weatherwell-shell-v9")).toBe(false);
    expect(store.has("weatherwell-assets-v9")).toBe(false);
  });
});
