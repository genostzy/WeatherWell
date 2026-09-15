import { describe, it, expect } from "vitest";
import { checkHealth } from "./check-health.mjs";

/**
 * checkHealth() is consumed by .github/workflows/monitor.yml, run on a
 * schedule with no human watching. A non-zero exit fails that run and
 * GitHub emails the repository owner — that email is the alert, so what
 * ends up in `lines` (and therefore in the email) matters as much as `ok`.
 */

const HEALTH_URL = "https://example.test/api/health";
const HOME_URL = "https://example.test/";

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

/** A fake fetch keyed on url string; typed as `typeof fetch` so it can stand in for `fetchImpl`. */
function fakeFetch(handler: (url: string) => Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
}

describe("checkHealth", () => {
  it("is ok when health reports no recent errors and home loads", async () => {
    const fetchImpl = fakeFetch(async (url) => {
      if (url === HEALTH_URL) return jsonResponse(200, { status: "ok", database: "ok", recentErrors: 0 });
      if (url === HOME_URL) return jsonResponse(200, {});
      throw new Error(`unexpected url ${url}`);
    });

    const { ok, lines } = await checkHealth({ healthUrl: HEALTH_URL, homeUrl: HOME_URL, fetchImpl, retryDelayMs: 0 });

    expect(ok).toBe(true);
    expect(lines).toContain("health ok");
    expect(lines).toContain("production homepage ok");
  });

  it("is not ok when health reports recent crashes, and names the count", async () => {
    const fetchImpl = fakeFetch(async (url) => {
      if (url === HEALTH_URL) return jsonResponse(200, { status: "ok", database: "ok", recentErrors: 3 });
      if (url === HOME_URL) return jsonResponse(200, {});
      throw new Error(`unexpected url ${url}`);
    });

    const { ok, lines } = await checkHealth({ healthUrl: HEALTH_URL, homeUrl: HOME_URL, fetchImpl, retryDelayMs: 0 });

    expect(ok).toBe(false);
    expect(lines).toContain("new crashes in the last 15 minutes: 3");
  });

  it("is not ok when the health check fails twice in a row", async () => {
    const fetchImpl = fakeFetch(async (url) => {
      if (url === HEALTH_URL) return jsonResponse(503, {});
      if (url === HOME_URL) return jsonResponse(200, {});
      throw new Error(`unexpected url ${url}`);
    });

    const { ok, lines } = await checkHealth({ healthUrl: HEALTH_URL, homeUrl: HOME_URL, fetchImpl, retryDelayMs: 0 });

    expect(ok).toBe(false);
    expect(lines).toContain("health check failed: HTTP 503");
  });

  it("retries once and recovers when the second health attempt succeeds", async () => {
    let healthCalls = 0;
    const fetchImpl = fakeFetch(async (url) => {
      if (url === HEALTH_URL) {
        healthCalls += 1;
        if (healthCalls === 1) return jsonResponse(503, {});
        return jsonResponse(200, { status: "ok", database: "ok", recentErrors: 0 });
      }
      if (url === HOME_URL) return jsonResponse(200, {});
      throw new Error(`unexpected url ${url}`);
    });

    const { ok, lines } = await checkHealth({ healthUrl: HEALTH_URL, homeUrl: HOME_URL, fetchImpl, retryDelayMs: 0 });

    expect(healthCalls).toBe(2);
    expect(ok).toBe(true);
    expect(lines).toContain("health ok");
  });

  it("is not ok when the health endpoint is unreachable on both attempts", async () => {
    const fetchImpl = fakeFetch(async (url) => {
      if (url === HEALTH_URL) throw new Error("network error with a stack trace and maybe an IP");
      if (url === HOME_URL) return jsonResponse(200, {});
      throw new Error(`unexpected url ${url}`);
    });

    const { ok, lines } = await checkHealth({ healthUrl: HEALTH_URL, homeUrl: HOME_URL, fetchImpl, retryDelayMs: 0 });

    expect(ok).toBe(false);
    expect(lines).toContain("health check failed: unreachable");
  });

  it("is not ok when the production homepage fails", async () => {
    const fetchImpl = fakeFetch(async (url) => {
      if (url === HEALTH_URL) return jsonResponse(200, { status: "ok", database: "ok", recentErrors: 0 });
      if (url === HOME_URL) return jsonResponse(500, {});
      throw new Error(`unexpected url ${url}`);
    });

    const { ok, lines } = await checkHealth({ healthUrl: HEALTH_URL, homeUrl: HOME_URL, fetchImpl, retryDelayMs: 0 });

    expect(ok).toBe(false);
    expect(lines).toContain("production homepage failed: HTTP 500");
  });

  it("never prints a response body, only the failure kind and the crash count", async () => {
    const sensitive = "user@example.com 192.168.1.1 uuid-1234-5678 tok_secretsecretsecret";
    const fetchImpl = fakeFetch(async (url) => {
      if (url === HEALTH_URL) return jsonResponse(200, { status: "ok", database: "ok", recentErrors: 2, leaked: sensitive });
      if (url === HOME_URL) return jsonResponse(500, { leaked: sensitive });
      throw new Error(`unexpected url ${url}`);
    });

    const { lines } = await checkHealth({ healthUrl: HEALTH_URL, homeUrl: HOME_URL, fetchImpl, retryDelayMs: 0 });

    for (const line of lines) {
      expect(line).not.toContain(sensitive);
      expect(line).not.toContain("@example.com");
      expect(line).not.toContain("192.168.1.1");
    }
  });
});
