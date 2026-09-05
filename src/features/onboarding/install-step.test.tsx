import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallStep } from "./install-step";
import { LanguageProvider } from "@/features/i18n/language-provider";

/**
 * Installing is the precondition for the app's central promise: cached alerts
 * and evacuation instructions only exist on a device that has the app before
 * the network fails. So the two things worth pinning down are that the step
 * always makes the argument, and that it never becomes a dead end — whatever
 * the browser does or does not support, a resident can still get to the app.
 */

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });
}

function setStandalone(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("display-mode: standalone") ? matches : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

const ORIGINAL_UA = window.navigator.userAgent;

beforeEach(() => {
  setUserAgent(ORIGINAL_UA);
  setStandalone(false);
});

afterEach(() => {
  setUserAgent(ORIGINAL_UA);
  vi.restoreAllMocks();
});

function renderStep(onContinue = vi.fn()) {
  render(
    <LanguageProvider>
      <InstallStep onContinue={onContinue} />
    </LanguageProvider>
  );
  return onContinue;
}

describe("InstallStep", () => {
  it("makes the case for installing before the storm, not just after", () => {
    renderStep();
    expect(screen.getByText(/may not be able to download anything/i)).toBeInTheDocument();
    expect(screen.getByText(/readable with no signal/i)).toBeInTheDocument();
  });

  it("always offers a way onward, even with no install support", async () => {
    // jsdom fires no beforeinstallprompt, so this is the no-support path.
    const onContinue = renderStep();
    await userEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("explains the Share-sheet route on iPhone rather than showing a button that cannot work", () => {
    // iOS Safari has no programmatic install at all; a disabled or fake
    // Install button there would be a lie the resident cannot act on.
    setUserAgent(IPHONE_UA);
    renderStep();

    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^install$/i })).not.toBeInTheDocument();
  });

  it("points at the browser menu on a desktop browser with no captured prompt", () => {
    renderStep();
    // Matched on the instruction's own wording: "browser's menu" alone also
    // appears in the skip note underneath.
    expect(screen.getByText(/choose Install app, or Add to Home Screen/i)).toBeInTheDocument();
  });

  it("stops asking once the app is already installed", () => {
    setStandalone(true);
    renderStep();

    expect(screen.getByText(/already installed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /not now/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("localises the argument, since it is the reason and not decoration", () => {
    render(
      <LanguageProvider initialLang="fil">
        <InstallStep onContinue={vi.fn()} />
      </LanguageProvider>
    );
    expect(screen.getByText(/hindi ka na makapag-download/i)).toBeInTheDocument();
  });
});
