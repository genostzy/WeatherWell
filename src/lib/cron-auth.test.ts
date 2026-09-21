import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// cron-auth.ts itself does `import "server-only"` — that throws
// unconditionally under Vitest (see load-official.test.ts for the same
// pattern), so the package is replaced rather than mocking a caller.
vi.mock("server-only", () => ({}));

import { isAuthorizedCronRequest } from "./cron-auth";

function requestWithAuth(header?: string): Request {
  return new Request("https://weatherwell.app/api/cron/typhoon", {
    headers: header ? { authorization: header } : {},
  });
}

describe("isAuthorizedCronRequest", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret-value";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("authorizes a request carrying the exact bearer secret", () => {
    expect(isAuthorizedCronRequest(requestWithAuth("Bearer test-secret-value"))).toBe(true);
  });

  it("refuses a request with no authorization header at all", () => {
    expect(isAuthorizedCronRequest(requestWithAuth())).toBe(false);
  });

  it("refuses a request with the wrong secret", () => {
    expect(isAuthorizedCronRequest(requestWithAuth("Bearer wrong-value"))).toBe(false);
  });

  it("refuses a request missing the Bearer prefix", () => {
    expect(isAuthorizedCronRequest(requestWithAuth("test-secret-value"))).toBe(false);
  });

  it("fails closed when CRON_SECRET is not configured at all, even with a matching-looking header", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest(requestWithAuth("Bearer undefined"))).toBe(false);
    expect(isAuthorizedCronRequest(requestWithAuth("Bearer "))).toBe(false);
  });
});
