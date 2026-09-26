import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider, useLanguage } from "./language-provider";

function Probe() {
  const { lang, setLang } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang("fil")}>switch</button>
    </div>
  );
}

describe("LanguageProvider", () => {
  it("defaults to English when no provider wraps the tree", () => {
    render(<Probe />);
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
  });

  it("provides and updates the active language", async () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    );
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByTestId("lang")).toHaveTextContent("fil");
  });

  it("accepts a starting language so tests can render a non-default one", () => {
    render(
      <LanguageProvider initialLang="fil">
        <Probe />
      </LanguageProvider>
    );
    expect(screen.getByTestId("lang")).toHaveTextContent("fil");
  });
});

describe("LanguageProvider and the page's language (WCAG 3.1.1)", () => {
  it("declares the page Filipino while Filipino is on, so a screen reader speaks it as Filipino", async () => {
    function Switch() {
      const { setLang } = useLanguage();
      return (
        <>
          <button onClick={() => setLang("fil")}>fil</button>
          <button onClick={() => setLang("en")}>en</button>
        </>
      );
    }
    render(
      <LanguageProvider>
        <Switch />
      </LanguageProvider>
    );
    expect(document.documentElement.lang).toBe("en");
    fireEvent.click(screen.getByRole("button", { name: "fil" }));
    expect(document.documentElement.lang).toBe("fil");
    fireEvent.click(screen.getByRole("button", { name: "en" }));
    expect(document.documentElement.lang).toBe("en");
  });
});
