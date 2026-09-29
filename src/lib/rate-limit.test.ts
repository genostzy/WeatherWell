import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, createRateLimiter } from "./rate-limit";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createRateLimiter", () => {
  it("lets a key through as many times as the limit in one window, then refuses it", () => {
    const allow = createRateLimiter(3, 1_000);

    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
  });

  it("counts each key on its own", () => {
    const allow = createRateLimiter(1, 1_000);

    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    expect(allow("b")).toBe(true);
  });

  it("lets the key through again once its window has passed, and not before", () => {
    const allow = createRateLimiter(1, 1_000);
    allow("a");

    vi.advanceTimersByTime(999);
    expect(allow("a")).toBe(false);

    vi.advanceTimersByTime(1);
    expect(allow("a")).toBe(true);
  });

  it("counts the new window from the request that opened it", () => {
    const allow = createRateLimiter(1, 1_000);
    allow("a");
    vi.advanceTimersByTime(1_500);
    allow("a");

    vi.advanceTimersByTime(600);
    expect(allow("a")).toBe(false);
  });

  it("keeps separate counts for separate limiters", () => {
    const first = createRateLimiter(1, 1_000);
    const second = createRateLimiter(1, 1_000);
    first("a");

    expect(second("a")).toBe(true);
  });
});

describe("clientIp", () => {
  const request = (headers: Record<string, string>) => new Request("https://x/", { headers });

  it("takes the first address Vercel's edge lists, the caller's own", () => {
    expect(clientIp(request({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("puts callers with no address under one shared key", () => {
    expect(clientIp(request({}))).toBe("unknown");
    expect(clientIp(request({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});
