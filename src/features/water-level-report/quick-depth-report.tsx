"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { useLivePosition } from "@/features/homepage-map/use-live-position";
import { t } from "@/lib/i18n";
import { DEPTH_LEVELS, DEPTH_LABEL, DEPTH_CM, type DepthLevel } from "@/lib/depth";
import { addWaterLevelReport, useWaterLevelReports } from "@/lib/water-level-reports";
import { useActiveAlertForZone } from "@/lib/alerts-store";
import { countsTowardAlert } from "@/lib/weather-thresholds";
import { useAlertBars } from "@/lib/use-alert-bars";
import { discardEntry, readOutbox } from "@/lib/outbox/outbox";
import type { LocalizedText } from "@/lib/types";

const HOW_DEEP: LocalizedText = {
  en: "How deep is the water where you are?",
  fil: "Gaano kalalim ang tubig kung nasaan ka?",
};
const RECORDED: LocalizedText = { en: "Reported", fil: "Naiulat" };
// What the report counts toward, so a resident knows it mattered. "At least":
// the engine also weighs how trusted each device is, so three can be not yet enough.
const NEED_MORE: LocalizedText = {
  en: "At least {n} more neighbours need to report before your barangay gets an advisory.",
  fil: "Kailangan pa ng hindi bababa sa {n} kapitbahay na mag-ulat bago magkaroon ng abiso ang inyong barangay.",
};
const ENOUGH: LocalizedText = {
  en: "Enough neighbours have reported; your barangay gets an advisory once their reports are checked.",
  fil: "Sapat na ang mga kapitbahay na nag-ulat; magkakaroon ng abiso ang inyong barangay kapag nasuri ang mga ulat.",
};
const HAS_ALERT: LocalizedText = {
  en: "Your barangay already has an alert. Your report shows officials how deep it is.",
  fil: "May alerto na ang inyong barangay. Ipinapakita ng ulat mo sa mga opisyal kung gaano kalalim.",
};
const DRY_HELPS: LocalizedText = {
  en: "Thanks. This tells officials it is dry where you are.",
  fil: "Salamat. Ipinapaalam nito sa mga opisyal na tuyo sa kinaroroonan mo.",
};
const NO_LOCATION: LocalizedText = {
  en: "Sent without your location, so it can't count toward an automatic advisory. Officials still see it.",
  fil: "Naipadala nang walang lokasyon mo, kaya hindi ito mabibilang para sa awtomatikong paalala. Nakikita pa rin ito ng mga opisyal.",
};
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

/** How long the resident has to take back a mis-tap. */
const UNDO_WINDOW_MS = 3000;

type State =
  | { kind: "idle" }
  | { kind: "reported"; entryId: string; depthLevel: DepthLevel; located: boolean; canUndo: boolean }
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
  const reports = useWaterLevelReports();
  const activeAlert = useActiveAlertForZone(zoneId);
  const bar = useAlertBars()(zoneId);
  const agreeing = reports.filter((r) => r.zoneId === zoneId && countsTowardAlert(r)).length;
  const counts = (depth: DepthLevel, located: boolean): LocalizedText => {
    if (depth === "dry") return DRY_HELPS;
    if (activeAlert) return HAS_ALERT;
    // The engine counts only located reports, so never promise one it won't.
    if (!located) return NO_LOCATION;
    const needed = bar.reporters - agreeing;
    return needed > 0 ? { en: NEED_MORE.en.replace("{n}", String(needed)), fil: NEED_MORE.fil.replace("{n}", String(needed)) } : ENOUGH;
  };
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
    if (state.kind === "reported" && state.canUndo) discardEntry(state.entryId);
    try {
      const entry = addWaterLevelReport(zoneId, depthLevel, position, UNDO_WINDOW_MS);
      const report = { kind: "reported", entryId: entry.id, depthLevel, located: position !== null } as const;
      setState({ ...report, canUndo: true });
      // Only Undo expires; what was reported stays until the next tap, for
      // anyone who reads slowly (WCAG 2.2.1).
      timer.current = setTimeout(() => setState({ ...report, canUndo: false }), UNDO_WINDOW_MS);
    } catch {
      // enqueue throws OutboxWriteFailed when local storage is full or
      // blocked, meaning the report reached neither the queue nor the wire.
      // Saying "Reported" here would be the one lie this surface must not
      // tell.
      setState({ kind: "failed" });
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
      return;
    }
    discardEntry(entryId);
    setState({ kind: "undone" });
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

      {/* Stays in the page (a live region must exist before it speaks) but takes
          no room until it has a message: a reserved empty line read as a gap. */}
      <div role="status" aria-live="polite" className={state.kind === "idle" ? "sr-only" : "text-sm"}>
        {state.kind === "reported" && (
          <span className="block space-y-1">
            <span className="flex items-center gap-2">
              <span lang={lang} className="text-green-500">
                {t(RECORDED, lang)}: {t(DEPTH_LABEL[state.depthLevel], lang)}
              </span>
              {state.canUndo && (
                <Button type="button" variant="ghost" size="lg" onClick={() => undo(state.entryId)}>
                  {t(UNDO, lang)}
                </Button>
              )}
            </span>
            <span lang={lang} className="block text-muted-foreground">
              {t(counts(state.depthLevel, state.located), lang)}
            </span>
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
