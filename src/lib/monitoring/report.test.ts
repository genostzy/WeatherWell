import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportError, monitoringEnvironment, __resetReportCapForTests } from "./report";

const fetchMock = vi.fn();

beforeEach(() => {
  __resetReportCapForTests();
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "abc123");
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("reportError", () => {
  it("sends the scrubbed report to the RPC with the publishable key", async () => {
    await reportError(new Error("boom for wilson@example.com"), { source: "client", kind: "unhandled", route: "/map?x=1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proj.supabase.co/rest/v1/rpc/report_app_error");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.headers.apikey).toBe("sb_publishable_test");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ p_source: "client", p_kind: "unhandled", p_route: "/map", p_environment: "preview", p_release: "abc123" });
    expect(body.p_message).not.toContain("wilson@example.com");
    expect(JSON.stringify(body)).not.toMatch(/x=1/);
  });

  it("sends nothing in development", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "development");
    expect(monitoringEnvironment()).toBeNull();
    await reportError(new Error("boom"), { source: "client", kind: "unhandled", route: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the environment is unset (tests, local)", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    await reportError(new Error("boom"), { source: "client", kind: "unhandled", route: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing while the browser is offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await reportError(new Error("boom"), { source: "client", kind: "unhandled", route: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for an expected refusal", async () => {
    await reportError(new Error("not an official for this barangay"), { source: "client", kind: "unhandled", route: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops after 10 reports from one page load", async () => {
    for (let i = 0; i < 15; i++) {
      await reportError(new Error(`boom ${i}`), { source: "client", kind: "unhandled", route: "/" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("never throws when sending fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(reportError(new Error("boom"), { source: "client", kind: "unhandled", route: "/" })).resolves.toBeUndefined();
  });
});
