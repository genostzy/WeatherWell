import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { LanguageProvider } from "@/features/i18n/language-provider";
import AppError from "./error";
import { reportError } from "@/lib/monitoring/report";

vi.mock("@/lib/monitoring/report", () => ({
  reportError: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("app error boundary", () => {
  it("reports the render error exactly once", () => {
    const error = Object.assign(new Error("render boom"), { digest: "d1" });
    const { rerender } = render(
      <LanguageProvider>
        <AppError error={error} reset={() => {}} />
      </LanguageProvider>
    );

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error, {
      source: "client",
      kind: "render",
      route: window.location.pathname,
    });

    rerender(
      <LanguageProvider>
        <AppError error={error} reset={() => {}} />
      </LanguageProvider>
    );

    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
