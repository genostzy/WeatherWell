"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

export interface NavSection {
  /** The id of the element on the page the link goes to. */
  id: string;
  label: LocalizedText;
}

const LABEL: LocalizedText = { en: "Sections on this page", fil: "Mga bahagi ng pahinang ito" };
const HEADING: LocalizedText = { en: "On this page", fil: "Sa pahinang ito" };

/**
 * A menu of a long dashboard's sections, so an official reaches "What
 * neighbours are reporting" without scrolling past everything above it. On a
 * wide screen it is a sidebar that stays in view; on a phone, a row of links
 * that stays at the top. The page scrolls as before. A link moves focus to
 * its section, so a keyboard or screen-reader user lands where they asked to.
 */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const { lang } = useLanguage();
  const [current, setCurrent] = useState<string | null>(null);

  // Marks the section in view as the reader scrolls (where the browser can tell).
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) setCurrent(visible[0].target.id);
      },
      { rootMargin: "0px 0px -70% 0px" }
    );
    for (const { id } of sections) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  function go(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${id}`);
    setCurrent(id);
  }

  return (
    <nav
      aria-label={t(LABEL, lang)}
      className="sticky top-0 z-20 -mx-4 w-[calc(100%+2rem)] border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:top-6 lg:mx-0 lg:w-56 lg:shrink-0 lg:self-start lg:border-b-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
      <p lang={lang} className="mb-2 hidden text-xs font-semibold uppercase text-muted-foreground lg:block">
        {t(HEADING, lang)}
      </p>
      <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
        {sections.map(({ id, label }) => (
          <li key={id} className="shrink-0">
            <a
              href={`#${id}`}
              lang={lang}
              aria-current={current === id ? "true" : undefined}
              onClick={(event) => go(event, id)}
              className="flex min-h-11 items-center whitespace-nowrap rounded-md border-2 border-border px-3 text-sm hover:bg-muted aria-[current=true]:border-primary aria-[current=true]:font-semibold lg:min-h-9 lg:whitespace-normal lg:border-0 lg:border-l-2 lg:rounded-none lg:px-3 lg:py-1"
            >
              {t(label, lang)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
