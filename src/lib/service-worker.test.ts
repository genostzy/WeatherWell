import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

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
/** Unversioned by design — evacuation data must survive a deploy. */
const ZONE_CACHE = "weatherwell-zones";

interface FakeResponse {
  body: string;
  status: number;
  clone(): FakeResponse;
}

function response(body: string, status = 200): FakeResponse {
  return { body, status, clone: () => response(body, status) };
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

  return { listeners, store };
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
});

describe("service worker install", () => {
  it("still caches every other route when one of them fails", async () => {
    // cache.addAll is all-or-nothing: one route answering non-200 during a
    // deploy would reject, fail the install, and leave the worker inactive —
    // no cache, no fetch handler, no offline support, and nothing surfacing
    // the failure. A bad route must cost only itself.
    const { listeners, store } = loadServiceWorker({
      fetch: async (url) => (url === "/admin/map" ? response("boom", 500) : response("ok")),
    });

    const waits: Promise<unknown>[] = [];
    listeners.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);

    const shell = store.get(SHELL_CACHE)!;
    expect(shell.has("/admin/map")).toBe(false);
    expect(shell.has("/")).toBe(true);
    expect(shell.has("/evacuation")).toBe(true);
    expect(shell.size).toBeGreaterThanOrEqual(6);
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
