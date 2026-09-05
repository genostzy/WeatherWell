import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertDowngradeNotice } from "./alert-downgrade-notice";
import { LanguageProvider } from "@/features/i18n/language-provider";

/**
 * The point of this notice is that a withdrawn warning does not pass in
 * silence, so what matters is that it always names what was withdrawn — and
 * that it never invents a reason nobody gave it.
 */

function renderNotice(notice: Parameters<typeof AlertDowngradeNotice>[0]["notice"], lang?: "fil") {
  render(
    <LanguageProvider initialLang={lang}>
      <AlertDowngradeNotice notice={notice} />
    </LanguageProvider>
  );
}

describe("AlertDowngradeNotice", () => {
  it("names the withdrawn severity when an alert is lifted entirely", () => {
    // Without this the strongest state in the system just stops rendering.
    renderNotice({ from: "evacuate", to: "none" });
    expect(screen.getByText(/Alert lifted/i)).toBeInTheDocument();
    expect(screen.getByText(/Evacuate Now/i)).toBeInTheDocument();
  });

  it("names both ends of a downgrade, so the direction is unambiguous", () => {
    renderNotice({ from: "red", to: "yellow" });
    const text = screen.getByRole("status").textContent!;
    expect(text).toMatch(/Warning/);
    expect(text).toMatch(/Advisory/);
    expect(text).toMatch(/downgraded/i);
  });

  it("claims no reason for the change, because none was recorded", () => {
    // Copy like "water levels below threshold" would read well and be an
    // assertion the system has no basis for. Guard against it drifting back in.
    renderNotice({ from: "evacuate", to: "none" });
    expect(screen.getByRole("status").textContent).not.toMatch(/threshold|water level/i);
  });

  it("announces politely rather than interrupting", () => {
    renderNotice({ from: "red", to: "yellow" });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("localises, since a de-escalation is as safety-critical as the alert", () => {
    renderNotice({ from: "evacuate", to: "none" }, "fil");
    expect(screen.getByText(/Inalis ang alerto/i)).toBeInTheDocument();
    expect(screen.getByText(/Lumikas Na/i)).toBeInTheDocument();
  });
});
