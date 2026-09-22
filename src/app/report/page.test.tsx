import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

// Submitting queues a report, and queuing asks the outbox to drain, which
// signs in. Stubbed to the offline answer so this file never constructs the
// real Supabase browser client — it is about what the page tells the resident,
// not about the wire.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));

import ReportPage from "./page";

// The report page mounts the live-position watch; only geolocation is faked
// (never the whole navigator — Leaflet reads userAgent at module init).
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() },
});

describe("ReportPage when the report cannot be saved", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Full local storage, the way a real phone presents it: `setItem` throws
   * QuotaExceededError. `enqueue` verifies its own write and throws
   * OutboxWriteFailed, which used to reach an onClick handler with no catch
   * anywhere above it.
   */
  function fillUpLocalStorage() {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
  }

  /** The depth picked does not matter here; the submit does. */
  function submitAReport() {
    fireEvent.click(screen.getByRole("button", { name: /submit report|ipadala ang ulat/i }));
  }

  it("tells the resident the report was not saved instead of thanking them for it", () => {
    // The report reached neither the queue nor the network. "Report recorded"
    // here would tell someone standing in rising water that the barangay has
    // their report when nothing anywhere holds it.
    renderWithData(<ReportPage />);
    fillUpLocalStorage();

    submitAReport();

    expect(screen.getByText(/report not saved/i)).toBeInTheDocument();
    expect(screen.queryByText(/report recorded/i)).not.toBeInTheDocument();
  });

  it("says so in Filipino too", () => {
    // Every other string on this page is bilingual; the one that carries bad
    // news is not the one to leave in English only.
    renderWithData(<ReportPage />, { lang: "fil" });
    fillUpLocalStorage();

    submitAReport();

    // The heading and the body both open with this, hence getAllByText.
    expect(screen.getAllByText(/hindi naitala ang ulat/i).length).toBeGreaterThan(0);
    // And the part that tells them what to do about it.
    expect(screen.getByText(/magbakante ng espasyo/i)).toBeInTheDocument();
  });

  it("leaves the form usable so 'report again' is something they can actually do", () => {
    // ReportForm disables its button on submit and normally unmounts on
    // success. On this path it stays on screen, so a still-disabled button
    // would make the advice above it impossible to follow.
    renderWithData(<ReportPage />);
    fillUpLocalStorage();

    submitAReport();

    expect(screen.getByRole("button", { name: /submit report/i })).toBeEnabled();
  });

  it("thanks the resident when the report really was queued", () => {
    // The other half of the same claim: the failure path must not swallow a
    // report that did reach the queue.
    renderWithData(<ReportPage />);

    submitAReport();

    expect(screen.getByText(/report recorded/i)).toBeInTheDocument();
    expect(screen.queryByText(/report not saved/i)).not.toBeInTheDocument();
  });
});

describe("ReportPage evacuation centre line", () => {
  it("names the centre when the zone has a real one", () => {
    // The full centre name, not a bare "Nilombot" substring: the fixture
    // zone's own heading already says "Barangay Nilombot, Mapandan", so a
    // partial match collides with it.
    renderWithData(<ReportPage />);
    expect(screen.getByText(/Nilombot Elementary School/i)).toBeInTheDocument();
  });

  it("says no centre is on record rather than showing a blank name with a status badge", () => {
    const zones = FIXTURE_REFERENCE_DATA.zones.map((zone) => ({
      ...zone,
      evacuationCenterName: "",
    }));
    renderWithData(<ReportPage />, { data: { ...FIXTURE_REFERENCE_DATA, zones } });
    expect(screen.getByText(/no evacuation centre on record/i)).toBeInTheDocument();
  });
});
