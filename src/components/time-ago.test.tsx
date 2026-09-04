import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { TimeAgo } from "./time-ago";

const EIGHT_MINUTES_AGO = new Date(Date.now() - 8 * 60 * 1000).toISOString();

describe("TimeAgo", () => {
  it("renders the elapsed minutes in the browser", () => {
    render(<TimeAgo reportedAt={EIGHT_MINUTES_AGO} />);
    expect(screen.getByText(/8 min ago/)).toBeInTheDocument();
  });

  /**
   * The regression this component exists for. The server's "now" is not the
   * browser's, so any elapsed-time text it renders can round to a different
   * minute than hydration produces — which React reports as a hydration
   * mismatch. Server markup must therefore carry no time at all.
   */
  it("renders nothing on the server", () => {
    expect(renderToString(<TimeAgo reportedAt={EIGHT_MINUTES_AGO} />)).toBe("");
  });

  it("suppresses the prefix along with the time on the server", () => {
    // A separator left behind on its own would render as a dangling "·".
    expect(renderToString(<TimeAgo reportedAt={EIGHT_MINUTES_AGO} prefix="· " />)).toBe("");
  });

  it("renders the prefix in the browser", () => {
    render(<TimeAgo reportedAt={EIGHT_MINUTES_AGO} prefix="· " />);
    expect(screen.getByText(/· 8 min ago/)).toBeInTheDocument();
  });
});
