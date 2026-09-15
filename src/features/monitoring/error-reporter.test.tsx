import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ErrorReporter } from "./error-reporter";
import { reportError } from "@/lib/monitoring/report";

vi.mock("@/lib/monitoring/report", () => ({
  reportError: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ErrorReporter", () => {
  it("reports an uncaught window error", () => {
    const { unmount } = render(<ErrorReporter />);

    const error = new Error("boom");
    window.dispatchEvent(new ErrorEvent("error", { error }));

    expect(reportError).toHaveBeenCalledWith(error, {
      source: "client",
      kind: "unhandled",
      route: window.location.pathname + window.location.search,
    });

    unmount();
  });

  it("reports an unhandled promise rejection", () => {
    render(<ErrorReporter />);

    const reason = new Error("rejected");
    const event = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: reason });
    window.dispatchEvent(event);

    expect(reportError).toHaveBeenCalledWith(reason, {
      source: "client",
      kind: "unhandled",
      route: window.location.pathname + window.location.search,
    });
  });

  it("stops listening after unmount", () => {
    const { unmount } = render(<ErrorReporter />);
    unmount();

    const event = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: new Error("after unmount") });
    window.dispatchEvent(event);

    expect(reportError).not.toHaveBeenCalled();
  });
});
