"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { useLivePosition } from "@/features/homepage-map/use-live-position";
import { t } from "@/lib/i18n";
import { DEPTH_LEVELS, DEPTH_LABEL, DEPTH_CM, type DepthLevel } from "@/lib/depth";
import { addWaterLevelReport } from "@/lib/water-level-reports";
import { discardEntry, readOutbox } from "@/lib/outbox/outbox";
import type { LocalizedText } from "@/lib/types";

const HOW_DEEP: LocalizedText = {
  en: "How deep is the water where you are?",
  fil: "Gaano kalalim ang tubig kung nasaan ka?",
};
const RECORDED: LocalizedText = { en: "Reported", fil: "Naiulat" };
const UNDO: LocalizedText = { en: "Undo", fil: "Bawiin" };
const NOT_SAVED: LocalizedText = {
  en: "Report not saved — your phone's storage is full or blocked.",
  fil: "Hindi naitala ang ulat — puno o naka-block ang storage ng telepono.",
};
const ALREADY_SENT: LocalizedText = {
  en: "Already sent to the barangay — it can't be taken back.",
  fil: "Naipadala na sa barangay — hindi na ito mababawi.",
};
const WITHDRAWN: LocalizedText = { en: "Report withdrawn", fil: "Nabawi ang ulat" };

/** How long a terminal status message (withdrawn, already-sent, failed) stays up before the region clears itself. */
const STATUS_MESSAGE_MS = 4000;

/** How long the resident has to take back a mis-tap. */
const UNDO_WINDOW_MS = 3000;

type State =
  | { kind: "idle" }
  | { kind: "reported"; entryId: string; depthLevel: DepthLevel }
  | { kind: "undone" }
  | { kind: "too-late" }
  | { kind: "failed" };

/**
 * Five depth buttons where the tap IS the submission — the PRD's "it takes
 * one tap", which the /report form never delivered (navigate, pick, submit,
 * with `dry` as the default so the pick could not be skipped).
 *
 * There is deliberately no confirmation step. A confirm taxes every single
 * resident to guard against the rare mis-tap; a three-second undo taxes only
 * the person who actually mis-tapped. In an emergency, always pay the
 * mistake cost rather than the everyone cost.
 */
export function QuickDepthReport({ zoneId }: { zoneId: string }) {
  const { lang } = useLanguage();
  const position = useLivePosition();
  const [state, setState] = useState<State>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function report(depthLevel: DepthLevel) {
    if (timer.current) clearTimeout(timer.current);
    // A second depth tap while the first is still within its undo window is
    // a correction, not a second report — discard the one it's replacing so
    // both don't end up queued for one resident's one intent.
    if (state.kind === "reported") discardEntry(state.entryId);
    try {
      const entry = addWaterLevelReport(zoneId, depthLevel, position, UNDO_WINDOW_MS);
      setState({ kind: "reported", entryId: entry.id, depthLevel });
      timer.current = setTimeout(() => setState({ kind: "idle" }), UNDO_WINDOW_MS);
    } catch {
      // enqueue throws OutboxWriteFailed when local storage is full or
      // blocked, meaning the report reached neither the queue nor the wire.
      // Saying "Reported" here would be the one lie this surface must not
      // tell.
      setState({ kind: "failed" });
      timer.current = setTimeout(() => setState({ kind: "idle" }), STATUS_MESSAGE_MS);
    }
  }

  function undo(entryId: string) {
    if (timer.current) clearTimeout(timer.current);
    const stillQueued = readOutbox().some((entry) => entry.id === entryId);
    if (!stillQueued) {
      // The drain delivered it between the tap and the undo. Nothing to
      // withdraw, and pretending otherwise would tell a resident their
      // report is gone when the barangay already has it.
      setState({ kind: "too-late" });
      timer.current = setTimeout(() => setState({ kind: "idle" }), STATUS_MESSAGE_MS);
      return;
    }
    discardEntry(entryId);
    setState({ kind: "undone" });
    timer.current = setTimeout(() => setState({ kind: "idle" }), STATUS_MESSAGE_MS);
  }

  return (
    <section className="space-y-3">
      <h2 lang={lang} className="text-sm font-medium">
        {t(HOW_DEEP, lang)}
      </h2>

      <div className="grid grid-cols-5 gap-1.5">
        {DEPTH_LEVELS.map((level) => (
          <Button
            key={level}
            type="button"
            variant="outline"
            onClick={() => report(level)}
            className="h-auto min-h-16 flex-col gap-0.5 px-1 py-2"
          >
            <span lang={lang} className="text-xs leading-tight font-medium">
              {t(DEPTH_LABEL[level], lang)}
            </span>
            <span className="text-[10px] text-muted-foreground">~{DEPTH_CM[level]}cm</span>
          </Button>
        ))}
      </div>

      <div role="status" aria-live="polite" className="min-h-9 text-sm">
        {state.kind === "reported" && (
          <span className="flex items-center gap-2">
            <span lang={lang} className="text-green-500">
              {t(RECORDED, lang)}: {t(DEPTH_LABEL[state.depthLevel], lang)}
            </span>
            <Button type="button" variant="ghost" size="lg" onClick={() => undo(state.entryId)}>
              {t(UNDO, lang)}
            </Button>
          </span>
        )}
        {state.kind === "undone" && (
          <span lang={lang} className="text-muted-foreground">
            {t(WITHDRAWN, lang)}
          </span>
        )}
        {state.kind === "too-late" && (
          <span lang={lang} className="text-muted-foreground">
            {t(ALREADY_SENT, lang)}
          </span>
        )}
        {state.kind === "failed" && (
          <span lang={lang} className="text-severity-red">
            {t(NOT_SAVED, lang)}
          </span>
        )}
      </div>
    </section>
  );
}
