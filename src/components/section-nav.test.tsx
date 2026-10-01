import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { SectionNav } from "./section-nav";

const SECTIONS = [
  { id: "inbox", label: { en: "Needs your attention", fil: "Kailangan ng iyong pansin" } },
  { id: "reports", label: { en: "What neighbours are reporting", fil: "Ang iniuulat ng mga kapitbahay" } },
];

function page(lang: "en" | "fil" = "en") {
  return render(
    <LanguageProvider initialLang={lang}>
      <SectionNav sections={SECTIONS} />
      <section id="inbox">Inbox</section>
      <section id="reports">Reports</section>
    </LanguageProvider>
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("SectionNav", () => {
  it("lists every section as a link to it", () => {
    page();
    const nav = screen.getByRole("navigation", { name: "Sections on this page" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Needs your attention" })).toHaveAttribute("href", "#inbox");
    expect(screen.getByRole("link", { name: "What neighbours are reporting" })).toHaveAttribute("href", "#reports");
  });

  it("brings the section into view and moves focus to it, without leaving the page", async () => {
    const user = userEvent.setup();
    page();
    await user.click(screen.getByRole("link", { name: "What neighbours are reporting" }));
    const target = document.getElementById("reports")!;
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(target).toHaveFocus();
    expect(screen.getByRole("link", { name: "What neighbours are reporting" })).toHaveAttribute("aria-current", "true");
  });

  it("speaks Filipino", () => {
    page("fil");
    expect(screen.getByRole("navigation", { name: "Mga bahagi ng pahinang ito" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ang iniuulat ng mga kapitbahay" })).toBeInTheDocument();
  });
});
