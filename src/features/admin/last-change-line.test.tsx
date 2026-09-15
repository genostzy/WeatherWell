import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { LastChangeLine } from "./last-change-line";
import { AlertsContext } from "@/lib/alerts-store";
import type { AlertRecord } from "@/lib/types";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LastChangeLine", () => {
  it("renders the described sentence, actor and time for a mocked entry", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          occurredAt: "2026-09-14T02:14:00.000Z",
          actorName: "Juan Dela Cruz",
          actorArea: "0199901001",
          action: "alert.set",
          zoneId: "zone-1",
          targetId: "alert-1",
          detail: { from: "orange", to: "yellow" },
        },
      ],
    });

    render(
      <LanguageProvider>
        <LastChangeLine zoneId="zone-1" />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Lowered to Advisory/)).toBeInTheDocument();
    });
    expect(screen.getByText(/by Juan Dela Cruz/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/official-actions?zone=zone-1&kind=alert&limit=1");
  });

  it("does not show the English 'by' in Filipino, and names a database-written actor in Filipino (M2)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          occurredAt: "2026-09-14T02:14:00.000Z",
          actorName: "Automatic — auto_crowdsourced",
          actorArea: null,
          action: "alert.set",
          zoneId: "zone-1",
          targetId: "alert-1",
          detail: { from: "orange", to: "yellow" },
        },
      ],
    });

    render(
      <LanguageProvider initialLang="fil">
        <LastChangeLine zoneId="zone-1" />
      </LanguageProvider>
    );

    const line = await screen.findByText(/Ibinaba sa Paalala/);
    expect(line).toHaveTextContent(/^Ibinaba sa Paalala \(Awtomatiko — mga ulat ng komunidad\), /);
    expect(line).not.toHaveTextContent(/\bby\b/);
  });

  it("renders nothing when the response is an empty list", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => [] });

    const { container } = render(
      <LanguageProvider>
        <LastChangeLine zoneId="zone-1" />
      </LanguageProvider>
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing and does not throw when the fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const { container } = render(
      <LanguageProvider>
        <LastChangeLine zoneId="zone-1" />
      </LanguageProvider>
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing and does not throw on a non-ok response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) });

    const { container } = render(
      <LanguageProvider>
        <LastChangeLine zoneId="zone-1" />
      </LanguageProvider>
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LastChangeLine timestamps (I6)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function serve(occurredAt: string) {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          occurredAt,
          actorName: "Juan Dela Cruz",
          actorArea: "0199901001",
          action: "alert.set",
          zoneId: "zone-1",
          targetId: "alert-1",
          detail: { from: "orange", to: "yellow" },
        },
      ],
    });
  }

  it("shows a date as well as a time for an entry from an earlier day", async () => {
    serve(new Date(2026, 8, 8, 14, 14).toISOString());
    render(
      <LanguageProvider>
        <LastChangeLine zoneId="zone-1" />
      </LanguageProvider>
    );

    expect(await screen.findByText(/Juan Dela Cruz, Sep 8, 2:14\sPM/)).toBeInTheDocument();
  });

  it("shows the time only for an entry from today", async () => {
    serve(new Date(2026, 8, 15, 9, 5).toISOString());
    render(
      <LanguageProvider>
        <LastChangeLine zoneId="zone-1" />
      </LanguageProvider>
    );

    const line = await screen.findByText(/Juan Dela Cruz, /);
    expect(line).toHaveTextContent(/9:05/);
    expect(line).not.toHaveTextContent(/Sep/);
  });
});

describe("LastChangeLine after an alert write (C1)", () => {
  it("fetches the latest entry again when the alert list changes, so it names the write just made", async () => {
    const entry = (id: number, detail: Record<string, unknown>) => ({
      id,
      occurredAt: "2026-09-14T02:14:00.000Z",
      actorName: "Juan Dela Cruz",
      actorArea: "0199901001",
      action: "alert.set",
      zoneId: "zone-1",
      targetId: `alert-${id}`,
      detail,
    });
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [entry(1, { from: "orange", to: "yellow" })] })
      .mockResolvedValueOnce({ ok: true, json: async () => [entry(2, { from: "yellow", to: "red" })] });

    const before: AlertRecord[] = [];
    const after: AlertRecord[] = [
      {
        id: "alert-2",
        zoneId: "zone-1",
        severity: "red",
        message: { en: "x", fil: "x" },
        source: "manual",
        confidence: "validated",
        issuedAt: "2026-09-14T02:14:00.000Z",
        isActive: true,
      },
    ];

    const { rerender } = render(
      <LanguageProvider>
        <AlertsContext.Provider value={before}>
          <LastChangeLine zoneId="zone-1" />
        </AlertsContext.Provider>
      </LanguageProvider>
    );
    expect(await screen.findByText(/Lowered to Advisory/)).toBeInTheDocument();

    // What ReferenceDataProvider does once a write is confirmed: a new list.
    rerender(
      <LanguageProvider>
        <AlertsContext.Provider value={after}>
          <LastChangeLine zoneId="zone-1" />
        </AlertsContext.Provider>
      </LanguageProvider>
    );

    expect(await screen.findByText(/Raised to Warning/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
