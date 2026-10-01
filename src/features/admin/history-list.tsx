"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import {
  actionDayKey,
  actionDayLabel,
  describeAction,
  describeActor,
  formatActionClock,
} from "@/lib/official-actions-copy";
import type { OfficialAction } from "@/lib/official-actions-mapper";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "History", fil: "Kasaysayan" };
const SUBTITLE: LocalizedText = {
  en: "Who changed what, and when — every recorded action across the system",
  fil: "Sino ang nagbago ng ano, at kailan — bawat naitalang aksyon sa buong sistema",
};
const MY_AREA: LocalizedText = { en: "My area", fil: "Ang aking lugar" };
const ALL_AREAS: LocalizedText = { en: "All areas", fil: "Lahat ng lugar" };
const NO_ENTRIES: LocalizedText = { en: "No recorded actions yet.", fil: "Wala pang naitalang aksyon." };

export interface HistoryZone {
  id: string;
  name: string;
}

/**
 * Renders the already scope-filtered action list the server component
 * fetched (see src/app/admin/history/page.tsx). A plain "use client"
 * component, not the page itself, because describeAction's localized
 * sentence and the row's local time both depend on the live language
 * selection — a Server Component has no access to that client context, the
 * same split this codebase already uses for /admin (-> AdminOverview) and
 * /sign-in (-> SignInPanel).
 */
export function HistoryList({
  actions,
  zones,
  scope,
}: {
  actions: OfficialAction[];
  zones: HistoryZone[];
  scope: "mine" | "all";
}) {
  const { lang } = useLanguage();
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  // The actions arrive newest first; each day becomes a group under its own heading, so a row
  // shows only its time and an audit reads day by day.
  const days: { key: string; actions: OfficialAction[] }[] = [];
  for (const action of actions) {
    const key = actionDayKey(action.occurredAt);
    if (days.at(-1)?.key === key) days.at(-1)!.actions.push(action);
    else days.push({ key, actions: [action] });
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t(TITLE, lang)}</h1>
          <p className="text-muted-foreground">{t(SUBTITLE, lang)}</p>
        </div>

        <div className="flex gap-2" role="group">
          <Button asChild variant={scope === "mine" ? "default" : "outline"} size="sm">
            <Link href="/admin/history?scope=mine" aria-current={scope === "mine" ? "page" : undefined}>
              {t(MY_AREA, lang)}
            </Link>
          </Button>
          <Button asChild variant={scope === "all" ? "default" : "outline"} size="sm">
            <Link href="/admin/history?scope=all" aria-current={scope === "all" ? "page" : undefined}>
              {t(ALL_AREAS, lang)}
            </Link>
          </Button>
        </div>

        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(NO_ENTRIES, lang)}</p>
        ) : (
          <div className="space-y-4">
            {days.map((day) => (
              <section key={day.key} aria-labelledby={`day-${day.key}`}>
                <h2
                  id={`day-${day.key}`}
                  lang={lang}
                  className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-2 text-sm font-semibold text-muted-foreground backdrop-blur"
                >
                  {actionDayLabel(day.actions[0].occurredAt, lang)}
                </h2>
                <ul className="space-y-2">
                  {day.actions.map((action) => {
                    const zoneName = action.zoneId ? zoneById.get(action.zoneId)?.name : undefined;
                    return (
                      <li key={action.id}>
                        <Card>
                          <CardContent className="space-y-1 py-4">
                            <p lang={lang} className="text-sm font-medium">
                              {describeAction(action, lang)}
                              {zoneName ? ` — ${zoneName}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {describeActor(action.actorName, lang)}, {formatActionClock(action.occurredAt, lang)}
                            </p>
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
