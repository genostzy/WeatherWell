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

  it("removes both the error and the unhandledrejection listener on unmount", () => {
    // Dispatching a listener-less "error" event on window (the previous
    // version of this test) trips jsdom's own uncaught-error reporting and
    // produces a false "Unhandled Errors" failure unrelated to this
    // component. Spying on add/removeEventListener instead proves listener
    // removal directly, for both event types, without dispatching anything.
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<ErrorReporter />);

    const errorCall = addSpy.mock.calls.find(([type]) => type === "error");
    const rejectionCall = addSpy.mock.calls.find(([type]) => type === "unhandledrejection");
    expect(errorCall).toBeDefined();
    expect(rejectionCall).toBeDefined();
    const errorHandler = errorCall![1];
    const rejectionHandler = rejectionCall![1];

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("error", errorHandler);
    expect(removeSpy).toHaveBeenCalledWith("unhandledrejection", rejectionHandler);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
