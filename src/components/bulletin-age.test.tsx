import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BulletinAge } from "./bulletin-age";
import { LanguageProvider } from "@/features/i18n/language-provider";

const HOUR = 60 * 60 * 1000;

describe("BulletinAge", () => {
  afterEach(() => vi.useRealTimers());

  it("says how old the PAGASA bulletin is", () => {
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    render(<BulletinAge issuedAt={new Date(Date.now() - 3 * HOUR).toISOString()} />);
    expect(screen.getByText(/pagasa bulletin, 3 h old/i)).toBeInTheDocument();
    expect(screen.queryByText(/may be out of date/i)).not.toBeInTheDocument();
  });

  it("warns once the bulletin is older than 12 hours", () => {
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    render(
      <LanguageProvider initialLang="fil">
        <BulletinAge issuedAt={new Date(Date.now() - 20 * HOUR).toISOString()} />
      </LanguageProvider>
    );
    expect(screen.getByText(/20 oras/i)).toBeInTheDocument();
    expect(screen.getByText(/maaaring luma na/i)).toBeInTheDocument();
  });

  it("renders nothing without a timestamp", () => {
    const { container } = render(<BulletinAge issuedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("BulletinAge source (idea 16)", () => {
  afterEach(() => vi.useRealTimers());

  it("says when a reading came from the GDACS backup, not PAGASA", () => {
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    render(<BulletinAge issuedAt={new Date(Date.now() - 2 * HOUR).toISOString()} source="GDACS" />);
    expect(screen.getByText(/GDACS backup reading, 2 h old/i)).toBeInTheDocument();
    expect(screen.queryByText(/pagasa bulletin/i)).not.toBeInTheDocument();
  });
});
