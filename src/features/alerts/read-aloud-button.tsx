"use client";

import { useState, useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { LanguageCode, LocalizedText } from "@/lib/types";

const READ_ALOUD: LocalizedText = { en: "Read aloud", fil: "Basahin nang malakas" };
const NO_FILIPINO_VOICE = "Walang boses na Filipino sa teleponong ito, kaya sa English ito binasa.";

const noSubscribe = () => () => {};

/**
 * The browser's own speech (free, on-device, works offline) for residents who
 * find reading hard. Filipino uses the phone's Filipino voice. A phone that
 * lists its voices and has none reads the English text instead, and says so:
 * an English voice reading Filipino garbles it past understanding. A phone
 * that has not listed its voices yet still gets Filipino.
 */
export function ReadAloudButton({ text, lang }: { text: LocalizedText; lang: LanguageCode }) {
  const canSpeak = useSyncExternalStore(noSubscribe, () => typeof window !== "undefined" && !!window.speechSynthesis, () => false);
  const [readInEnglish, setReadInEnglish] = useState(false);
  if (!canSpeak) return null;

  function speak() {
    const voices = window.speechSynthesis.getVoices?.() ?? [];
    const filipino = voices.find((voice) => /^(fil|tl)\b/i.test(voice.lang));
    const english = lang === "en" || (voices.length > 0 && !filipino);
    const utterance = new SpeechSynthesisUtterance(english ? text.en : text.fil);
    utterance.lang = english ? "en-PH" : "fil-PH";
    if (!english && filipino) utterance.voice = filipino;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setReadInEnglish(lang === "fil" && english);
  }

  return (
    <>
      <Button type="button" variant="outline" size="lg" onClick={speak}>
        <Volume2 aria-hidden="true" className="h-4 w-4" />
        <span lang={lang}>{t(READ_ALOUD, lang)}</span>
      </Button>
      {readInEnglish && (
        <p role="status" lang="fil" className="text-xs text-muted-foreground">
          {NO_FILIPINO_VOICE}
        </p>
      )}
    </>
  );
}
