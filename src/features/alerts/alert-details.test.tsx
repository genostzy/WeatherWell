import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AlertDetails } from "./alert-details";
import { getActiveAlertForZone } from "@/lib/mock-data";
import { zoneWithSeverity } from "@/test-utils/mock-fixtures";

const zone = zoneWithSeverity("red");
const alert = getActiveAlertForZone(zone.id)!;

describe("AlertDetails read-aloud", () => {
  const speak = vi.fn();
  const cancel = vi.fn();

  beforeEach(() => {
    speak.mockClear();
    cancel.mockClear();
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        lang = "";
        constructor(text: string) {
          this.text = text;
        }
      }
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reads the alert aloud in the resident's language", () => {
    render(<AlertDetails alert={alert} zone={zone} lang="fil" />);
    fireEvent.click(screen.getByRole("button", { name: /basahin nang malakas/i }));
    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0];
    expect(utterance.text).toContain(alert.message.fil);
    expect(utterance.lang).toBe("fil-PH");
  });

  it("offers no button where the browser cannot speak", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("speechSynthesis", undefined);
    render(<AlertDetails alert={alert} zone={zone} lang="en" />);
    expect(screen.queryByRole("button", { name: /read aloud/i })).not.toBeInTheDocument();
  });
});

describe("AlertDetails age", () => {
  afterEach(() => vi.useRealTimers());

  it("says how long ago the alert was issued, without a stale flag when recent", () => {
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    const issuedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    render(<AlertDetails alert={{ ...alert, issuedAt }} zone={zone} lang="en" />);
    expect(screen.getByText(/issued 3 h ago/i)).toBeInTheDocument();
    expect(screen.queryByText(/may no longer be current/i)).not.toBeInTheDocument();
  });
});
