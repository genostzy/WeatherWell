import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequestError } from "./instrumentation";
import { reportError } from "@/lib/monitoring/report";

vi.mock("@/lib/monitoring/report", () => ({
  reportError: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("onRequestError", () => {
  it("reports a server error with its request path", async () => {
    const error = new Error("server boom");

    await onRequestError(
      error,
      { path: "/api/zones?x=1", method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/api/zones",
        routeType: "route",
        renderSource: undefined,
        revalidateReason: undefined,
      }
    );

    expect(reportError).toHaveBeenCalledWith(error, {
      source: "server",
      kind: "request",
      route: "/api/zones?x=1",
    });
  });
});
