import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { LastChangeLine } from "./last-change-line";

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
      expect(screen.getByText(/Lowered to Yellow/)).toBeInTheDocument();
    });
    expect(screen.getByText(/by Juan Dela Cruz/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/official-actions?zone=zone-1&kind=alert&limit=1");
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
