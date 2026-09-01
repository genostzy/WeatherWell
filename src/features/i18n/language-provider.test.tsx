import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
