import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import GlobalError from "./global-error";
import { reportError } from "@/lib/monitoring/report";

vi.mock("@/lib/monitoring/report", () => ({
  reportError: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("global-error", () => {
  it("reports the layout error once and shows both languages", () => {
    const error = new Error("layout boom");
    render(<GlobalError error={error} retry={() => {}} />);

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error, {
      source: "client",
      kind: "render",
      route: window.location.pathname,
    });

    expect(
      screen.getByText(/Something went wrong loading WeatherWell\. Please try again\./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/May naganap na problema sa pag-load ng WeatherWell\. Pakisubukang muli\./)
    ).toBeInTheDocument();
  });
});
