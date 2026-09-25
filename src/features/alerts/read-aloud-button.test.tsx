import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReadAloudButton } from "./read-aloud-button";

const text = { en: "Go to the chapel now.", fil: "Pumunta na sa kapilya." };
const speak = vi.fn();
const cancel = vi.fn();

function withVoices(voices: { lang: string; name: string }[]) {
  vi.stubGlobal("speechSynthesis", { speak, cancel, getVoices: () => voices });
}

beforeEach(() => {
  speak.mockClear();
  cancel.mockClear();
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      lang = "";
      voice: unknown = null;
      constructor(value: string) {
        this.text = value;
      }
    }
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("ReadAloudButton (Stage 4 Task 5)", () => {
  it("reads Filipino with the phone's own Filipino voice", () => {
    const filipino = { lang: "fil-PH", name: "Filipino" };
    withVoices([{ lang: "en-US", name: "English" }, filipino]);
    render(<ReadAloudButton text={text} lang="fil" />);

    fireEvent.click(screen.getByRole("button", { name: /basahin nang malakas/i }));

    const utterance = speak.mock.calls[0][0];
    expect(utterance.text).toBe(text.fil);
    expect(utterance.lang).toBe("fil-PH");
    expect(utterance.voice).toBe(filipino);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reads the English text on a phone with no Filipino voice, and says why", () => {
    // An English voice reading Filipino words garbles them past understanding.
    withVoices([{ lang: "en-US", name: "English" }]);
    render(<ReadAloudButton text={text} lang="fil" />);

    fireEvent.click(screen.getByRole("button", { name: /basahin nang malakas/i }));

    const utterance = speak.mock.calls[0][0];
    expect(utterance.text).toBe(text.en);
    expect(utterance.lang).toBe("en-PH");
    expect(screen.getByRole("status")).toHaveTextContent(/walang boses na filipino/i);
  });

  it("still tries Filipino when the phone has not listed its voices yet", () => {
    withVoices([]);
    render(<ReadAloudButton text={text} lang="fil" />);

    fireEvent.click(screen.getByRole("button", { name: /basahin nang malakas/i }));

    expect(speak.mock.calls[0][0]).toMatchObject({ text: text.fil, lang: "fil-PH" });
  });

  it("reads English in English", () => {
    withVoices([{ lang: "en-US", name: "English" }]);
    render(<ReadAloudButton text={text} lang="en" />);

    fireEvent.click(screen.getByRole("button", { name: /read aloud/i }));

    expect(speak.mock.calls[0][0]).toMatchObject({ text: text.en, lang: "en-PH" });
  });

  it("offers no button where the browser cannot speak", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    render(<ReadAloudButton text={text} lang="en" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
