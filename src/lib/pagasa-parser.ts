/**
 * PAGASA Tropical Cyclone Bulletin parser.
 *
 * Ported from BagyoAPI (MIT) — adapted for WeatherWell's schema.
 * Parses PAGASA's severe-weather-bulletin HTML page and extracts
 * cyclone name, position, intensity, movement, and wind signal areas.
 */
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { LocalizedText } from "./types";

export type CycloneCategory =
  | "TD"
  | "TS"
  | "STS"
  | "TY"
  | "STY"
  | null;

const CATEGORY_PREFIXES: ReadonlyArray<[string, CycloneCategory]> = [
  ["super typhoon", "STY"],
  ["severe tropical storm", "STS"],
  ["tropical storm", "TS"],
  ["tropical depression", "TD"],
  ["typhoon", "TY"],
];

const CATEGORY_LABELS: Record<string, LocalizedText> = {
  TD: { en: "Tropical Depression", fil: "Depresyong Tropikal" },
  TS: { en: "Tropical Storm", fil: "Bagyong Tropikal" },
  STS: { en: "Severe Tropical Storm", fil: "Malakas na Bagyong Tropikal" },
  TY: { en: "Typhoon", fil: "Bagyo" },
  STY: { en: "Super Typhoon", fil: "Super Bagyo" },
};

export function categoryLabel(cat: CycloneCategory): LocalizedText {
  return cat ? CATEGORY_LABELS[cat] : { en: "Unknown", fil: "Hindi Alam" };
}

/** Collapse whitespace and repair common PDF-extraction artifacts. */
export function cleanText(input: string): string {
  return input
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+([.,)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/,\s*\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedNameLine {
  categoryRaw: string;
  category: CycloneCategory;
  pagasaName: string;
  internationalName: string | null;
  isFormer: boolean;
}

const QUOTE = /["""'']/g;

export function parseNameLine(rawLine: string): ParsedNameLine | null {
  const line = cleanText(rawLine).replace(QUOTE, '"');
  if (line.length === 0) return null;

  const formerly =
    /^(.*?)\s*\(\s*formerly\s+"?([A-Za-zÑñ-]+)"?\s*\)/i.exec(line);
  if (formerly?.[1] && formerly[2]) {
    return {
      categoryRaw: formerly[1].trim(),
      category: null,
      pagasaName: formerly[2].toUpperCase(),
      internationalName: null,
      isFormer: true,
    };
  }

  const lower = line.toLowerCase();
  for (const [prefix, category] of CATEGORY_PREFIXES) {
    if (!lower.startsWith(prefix)) continue;
    const rest = line.slice(prefix.length).trim();
    const m = /^"?([A-Za-zÑñ-]+)"?(?:\s*\(([A-Za-z-]+)\))?/.exec(rest);
    if (!m?.[1]) return null;
    return {
      categoryRaw: line.slice(0, prefix.length).trim(),
      category,
      pagasaName: m[1].toUpperCase(),
      internationalName: m[2] ? m[2].toUpperCase() : null,
      isFormer: false,
    };
  }
  return null;
}

export interface ParsedCenter {
  lat: number;
  lng: number;
  description: string | null;
  outsidePar: boolean;
}

export function parseCenter(rawText: string): ParsedCenter | null {
  const text = cleanText(rawText);
  const coords =
    /\(\s*(\d{1,2}(?:\.\d+)?)\s*°?\s*N\s*,?\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*E?\s*\)/i.exec(
      text
    );
  if (!coords?.[1] || !coords[2]) return null;
  const lat = Number(coords[1]);
  const lng = Number(coords[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let description: string | null = null;
  const before = text
    .slice(0, coords.index)
    .replace(/\s*\(OUTSIDE(?: THE)? PAR\)\s*/gi, " ");
  const desc = /\bat\s+(\d[\d,]*\s*km\s+[^()]*?)\s*$/i.exec(before);
  if (desc?.[1]) {
    description = desc[1].trim() || null;
  } else {
    const alt =
      /\b(?:at|in)\s+(the vicinity of [^()]+?)\s*$/i.exec(before);
    description = alt?.[1] ? alt[1].trim() : null;
  }

  return {
    lat,
    lng,
    description,
    outsidePar: /OUTSIDE(?: THE)? PAR/i.test(text),
  };
}

export interface ParsedIntensity {
  maxWindsKph: number | null;
  gustinessKph: number | null;
  pressureHpa: number | null;
}

export function parseIntensity(rawText: string): ParsedIntensity {
  const text = cleanText(rawText);
  const num = (re: RegExp): number | null => {
    const m = re.exec(text);
    return m?.[1] ? Number(m[1].replace(/,/g, "")) : null;
  };
  return {
    maxWindsKph: num(/maximum sustained winds of\s+([\d,]+)\s*km\/?h/i),
    gustinessKph: num(/gustiness of up to\s+([\d,]+)\s*km\/?h/i),
    pressureHpa: num(/central pressure of\s+([\d,.]+)\s*hPa/i),
  };
}

export interface ParsedMovement {
  direction: string | null;
  speedKph: number | null;
}

export function parseMovement(rawText: string): ParsedMovement {
  const text = cleanText(rawText).replace(/^moving\s+/i, "");
  if (text.length === 0) return { direction: null, speedKph: null };
  const withSpeed =
    /^(.+?)\s+at\s+([\d,]+)\s*km\/?h/i.exec(text);
  if (withSpeed?.[1] && withSpeed[2]) {
    return {
      direction: withSpeed[1].trim(),
      speedKph: Number(withSpeed[2].replace(/,/g, "")),
    };
  }
  if (/stationary/i.test(text))
    return { direction: "Almost stationary", speedKph: 0 };
  const slowly = /^(.+?)\s+slowly\b/i.exec(text);
  if (slowly?.[1])
    return { direction: slowly[1].trim(), speedKph: null };
  return { direction: text, speedKph: null };
}

export interface ParsedBulletinNumber {
  bulletinNumber: number;
  isFinal: boolean;
}

export function parseBulletinNumber(
  rawText: string
): ParsedBulletinNumber | null {
  const m =
    /BULLETIN\s*(?:NR\.?|NO\.?|#)?\s*(\d+)\s*[-–]?\s*(F\b|FINAL)?/i.exec(
      cleanText(rawText)
    );
  if (!m?.[1]) return null;
  return { bulletinNumber: Number(m[1]), isFinal: Boolean(m[2]) };
}

export interface ParsedWindSignalArea {
  locationName: string;
  partialDescriptor: string | null;
  raw: string;
}

export interface ParsedWindSignal {
  signalLevel: number;
  areas: ParsedWindSignalArea[];
}

export interface ParsedBulletin {
  source: "html" | "pdf";
  bulletinNumber: number;
  isFinal: boolean;
  pagasaName: string;
  internationalName: string | null;
  category: CycloneCategory;
  categoryRaw: string;
  issuedAt: string;
  nextBulletinAt: string | null;
  headline: string | null;
  center: ParsedCenter | null;
  maxWindsKph: number | null;
  gustinessKph: number | null;
  pressureHpa: number | null;
  movementDirection: string | null;
  movementSpeedKph: number | null;
  signals: ParsedWindSignal[];
}

/** Parse PAGASA date-time: "5:00 AM, 01 September 2026" → ISO 8601 */
function parsePagasaDateTime(text: string): string | null {
  const cleaned = cleanText(text);
  const m =
    /(\d{1,2}:\d{2}\s*(?:AM|PM)),?\s*(\d{1,2})\s+(\w+)\s+(\d{4})/i.exec(
      cleaned
    );
  if (!m) return null;
  const time = m[1];
  const day = m[2];
  const monthName = m[3];
  const year = m[4];

  const months: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  const monthNum = months[monthName.toLowerCase()];
  if (!monthNum) return null;

  const isPM = /PM/i.test(time) && !/^12/i.test(time);
  const isAM = /AM/i.test(time) && /^12/i.test(time);
  const [hours, minutes] = time
    .replace(/\s*(AM|PM)/i, "")
    .split(":")
    .map(Number);
  const h24 = isPM ? hours + 12 : isAM ? 0 : hours;

  return `${year}-${monthNum}-${day.padStart(2, "0")}T${String(h24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+08:00`;
}

function parseRelativePagasaTime(text: string): string | null {
  const cleaned = cleanText(text);
  const m =
    /next\s+(?:advisory|bulletin)\s*(?:at|will be issued at|:\s*)(.+)/i.exec(
      cleaned
    );
  if (!m?.[1]) return null;
  return parsePagasaDateTime(m[1]);
}

/** Simple area parser — extracts location names without PSGC resolution. */
function parseAreaListSimple(
  text: string
): { areas: ParsedWindSignalArea[]; issues: string[] } {
  const areas: ParsedWindSignalArea[] = [];
  const issues: string[] = [];
  const cleaned = cleanText(text);
  if (!cleaned || cleaned === "-") return { areas, issues };

  const DIR =
    "(?:extreme\\s+)?(?:north(?:ern)?|south(?:ern)?|east(?:ern)?|west(?:ern)?|central|northeastern|northwestern|southeastern|southwestern)";
  const PARTIAL_RE = new RegExp(
    `^(?:the\\s+)?(?:rest|${DIR})\\s+(?:portions?|half)?\\s*of\\s+(.+)$`,
    "i"
  );

  // Split on commas, " and ", " including " at top level (not inside parens)
  const segments: string[] = [];
  let depth = 0;
  let current = "";
  for (const token of cleaned.split(/(\(|\))/)) {
    if (token === "(") depth++;
    if (token === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && token !== "(" && token !== ")") {
      const parts = token.split(/,|\band\b|\bincluding\b/i);
      for (let i = 0; i < parts.length; i++) {
        current += parts[i] ?? "";
        if (i < parts.length - 1) {
          const t = current.trim().replace(/^and\s+/i, "");
          if (t) segments.push(t);
          current = "";
        }
      }
    } else {
      current += token;
    }
  }
  const last = current.trim().replace(/^and\s+/i, "");
  if (last) segments.push(last);

  for (const segment of segments) {
    let body = cleanText(segment).replace(/\.$/, "");
    const children: string[] = [];
    const paren = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(body);
    if (paren?.[1] && paren[2] !== undefined) {
      body = paren[1].trim();
      for (const child of paren[2].split(",")) {
        const t = cleanText(child);
        if (t) children.push(t);
      }
    }
    let partialDescriptor: string | null = null;
    const partial = PARTIAL_RE.exec(body);
    if (partial?.[1]) {
      const word = partial[1]
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/\s*&\s*/g, " and ");
      partialDescriptor =
        word === "rest" ? "rest" : `${word} portion`;
      body = body.replace(partial[0], "").trim();
    }
    body = body.replace(/^(?:the|of)\s+/i, "").trim();
    if (!body) continue;

    const raw = segment.trim();
    areas.push({ locationName: body, partialDescriptor, raw });
    for (const child of children) {
      areas.push({
        locationName: cleanText(child),
        partialDescriptor: null,
        raw: `${child} (${body})`,
      });
    }
  }
  return { areas, issues };
}

/**
 * Parse the wind signal table from PAGASA HTML bulletin.
 * Handles both the old format (class-based signal levels) and
 * the new format (image-based tcws icons).
 */
function parseHtmlSignals(
  $: CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $pane: any
): ParsedWindSignal[] {
  const signals = new Map<number, ParsedWindSignal>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cheerio callback types
  $pane.find("table").each((_: number, table: any) => {
    const $table = $(table);
    let currentLevel: number | null = null;

    $table.children("thead, tbody").each((_, block) => {
      const $block = $(block);
      if ($block.is("thead")) {
        currentLevel = null;
        const th = $block.find("th").first();
        const cls = th.attr("class") ?? "";
        const clsMatch = /signalno(\d)/i.exec(cls);
        const imgMatch = /tcws(\d)/i.exec(
          $block.find("img").attr("src") ?? ""
        );
        const textMatch = /Signal no\.?\s*(\d)/i.exec(cleanText(th.text()));
        const level =
          clsMatch?.[1] ?? imgMatch?.[1] ?? textMatch?.[1];
        if (level) currentLevel = Number(level);
        return;
      }
      if (currentLevel === null) return;
      const level = currentLevel;

      $block.children("tr").each((_, tr) => {
        const $tr = $(tr);
        const label = cleanText($tr.find("td").first().text());
        if (!/affected areas/i.test(label)) return;
        const $cell = $tr.find("td").eq(1);
        $cell.find("ul > li").each((_, li) => {
          const $li = $(li);
          const groupLabel = cleanText(
            $li.children("strong").first().text()
          ).toLowerCase();
          if (
            !["luzon", "visayas", "mindanao"].includes(groupLabel)
          )
            return;
          $li.find("ul > li").each((_, inner) => {
            const sentence = cleanText($(inner).text());
            if (!sentence || sentence === "-") return;
            const parsed = parseAreaListSimple(sentence);
            const existing = signals.get(level) ?? {
              signalLevel: level,
              areas: [],
            };
            existing.areas.push(...parsed.areas);
            signals.set(level, existing);
          });
        });
      });
    });
  });

  return [...signals.values()].sort(
    (a, b) => b.signalLevel - a.signalLevel
  );
}

/**
 * Panel body helper — finds a `.panel` with matching heading text
 * and returns the `.panel-body` content.
 */
function panelBody(
  $: CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $pane: any,
  heading: RegExp
): string | null {
  let found: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cheerio callback types
  $pane.find(".panel").each((_: number, el: any) => {
    if (found) return;
    const $el = $(el);
    const head = cleanText($el.find(".panel-heading").first().text());
    if (heading.test(head))
      found = cleanText($el.find(".panel-body").first().text());
  });
  return found;
}

export class BulletinParseError extends Error {
  constructor(
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "BulletinParseError";
  }
}

/**
 * Parse PAGASA's severe-weather-bulletin HTML page.
 * Returns null for "No Active Tropical Cyclone".
 */
export function parseBulletinHtml(html: string): ParsedBulletin | null {
  const $ = cheerio.load(html);

  const pageText = $(".article-content").text();
  if (
    /No Active Tropical Cyclone/i.test(pageText) ||
    /No Active Tropical Cyclone/i.test($.text())
  ) {
    return null;
  }

  const panes = $('div[role="tabpanel"]');
  if (panes.length === 0) {
    throw new BulletinParseError("no bulletin tab panels found");
  }

  // Parse the first (latest) bulletin pane
  const $pane = panes.first();
  const paneId = $pane.attr("id");
  const tabLink = paneId ? $(`a[href="#${paneId}"]`) : $();
  const headerText =
    tabLink.attr("data-header") ??
    $(".article-header").first().text() ??
    "";
  const num = parseBulletinNumber(headerText);
  if (!num) {
    throw new BulletinParseError("cannot extract bulletin number", {
      headerText,
    });
  }

  const name = parseNameLine($pane.find("h3").first().text());
  if (!name) {
    throw new BulletinParseError("cannot parse cyclone designation", {
      h3: $pane.find("h3").first().text(),
    });
  }

  let issuedAt: string | null = null;
  let nextBulletinAt: string | null = null;
  $pane.find("h5").each((_, el) => {
    const t = cleanText($(el).text());
    if (!issuedAt && /Issued at/i.test(t))
      issuedAt = parsePagasaDateTime(t);
  });
  if (!issuedAt) {
    throw new BulletinParseError("cannot parse issuance time");
  }
  $pane.find("h5").each((_, el) => {
    const t = cleanText($(el).text());
    if (
      !nextBulletinAt &&
      /next (advisory|bulletin)/i.test(t)
    ) {
      nextBulletinAt = parseRelativePagasaTime(t);
    }
  });

  let headline: string | null = null;
  $pane.find("h5").each((_, el) => {
    const t = cleanText($(el).text());
    if (headline || !t) return;
    if (
      /Issued at|next advisory|next bulletin|valid for broadcast/i.test(t)
    )
      return;
    if (t.length >= 15 && t === t.toUpperCase()) headline = t;
  });

  const centerText = panelBody($, $pane, /location of (the )?(eye|center)/i);
  const center = centerText ? parseCenter(centerText) : null;
  const intensity = parseIntensity(
    panelBody($, $pane, /strength|intensity/i) ?? ""
  );
  const movement = parseMovement(panelBody($, $pane, /movement/i) ?? "");
  const signals = parseHtmlSignals($, $pane);

  return {
    source: "html",
    bulletinNumber: num.bulletinNumber,
    isFinal: num.isFinal,
    pagasaName: name.pagasaName,
    internationalName: name.internationalName,
    category: name.category,
    categoryRaw: name.categoryRaw,
    issuedAt,
    nextBulletinAt,
    headline,
    center,
    maxWindsKph: intensity.maxWindsKph,
    gustinessKph: intensity.gustinessKph,
    pressureHpa: intensity.pressureHpa,
    movementDirection: movement.direction,
    movementSpeedKph: movement.speedKph,
    signals,
  };
}

/**
 * Parse the text extracted from a PAGASA TCB PDF.
 * Fallback when the HTML page can't be scraped.
 */
export function parseBulletinPdfText(text: string): ParsedBulletin | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => cleanText(l))
    .filter((l) => l.length > 0);
  const flat = cleanText(text);

  const numLine = lines.find((l) =>
    /TROPICAL CYCLONE BULLETIN/i.test(l)
  );
  const num = numLine ? parseBulletinNumber(numLine) : null;
  if (!num) return null;

  let name: ReturnType<typeof parseNameLine> = null;
  const headerIdx = lines.findIndex((l) =>
    /TROPICAL CYCLONE BULLETIN/i.test(l)
  );
  for (let i = headerIdx + 1; i < Math.min(headerIdx + 4, lines.length); i++) {
    name = parseNameLine(lines[i] ?? "");
    if (name) break;
  }
  if (!name) return null;

  const issuedLine = lines.find((l) => /Issued at/i.test(l));
  const issuedAt = issuedLine ? parsePagasaDateTime(issuedLine) : null;
  if (!issuedAt) return null;

  let nextBulletinAt: string | null = null;
  const nextLine = lines.find((l) =>
    /next (tropical cyclone )?bulletin/i.test(l)
  );
  if (nextLine) nextBulletinAt = parseRelativePagasaTime(nextLine);

  const BOILERPLATE =
    /BULLETIN|PAGASA|DOST|DEPARTMENT OF SCIENCE|SERVICES ADMINISTRATION|WEATHER DIVISION|TRACK AND INTENSITY|WIND SIGNALS|HAZARDS|TROPICAL CYCLONE WIND|OUTLOOK|REPUBLIC OF/i;
  const headline =
    lines
      .find(
        (l) =>
          l.length >= 25 &&
          l === l.toUpperCase() &&
          /[A-Z]{4}/.test(l) &&
          !BOILERPLATE.test(l)
      )
      ?.replace(/"\s+/g, '"')
      .replace(/\s+"/g, '"')
      .replace(/[""]/g, '"') ?? null;

  const center = parseCenter(flat);
  const intensity = parseIntensity(flat);

  let movement: ReturnType<typeof parseMovement> = {
    direction: null,
    speedKph: null,
  };
  const movementIdx = lines.findIndex((l) =>
    /^Present Movement/i.test(l)
  );
  if (movementIdx >= 0) {
    const inline =
      lines[movementIdx]?.replace(
        /^Present Movement:?\s*/i,
        ""
      ) ?? "";
    const source =
      inline.length > 0 ? inline : (lines[movementIdx + 1] ?? "");
    movement = parseMovement(source);
  }

  // Parse PDF signals
  const signals: ParsedWindSignal[] = [];
  const start = flat.search(
    /WIND SIGNALS?\s*\(TCWS\)\s*IN EFFECT/i
  );
  if (start !== -1) {
    let section = flat.slice(start);
    const end = section.search(
      /OTHER HAZARDS|HAZARDS AFFECTING|TRACK AND INTENSITY FORECAST/i
    );
    if (end !== -1) section = section.slice(0, end);

    if (!/No Wind Signal is currently hoisted/i.test(section)) {
      const LABEL_LINE =
        /Warning lead time|Range of wind speeds|Potential impacts|^TCWS No\.|^WIND SIGNALS?|^\s*Luzon\s+Visayas\s+Mindanao\s*$|^Wind threat:?$|^(?:Strong|Gale-force|Storm-force|Typhoon-force|Extreme)(?:\s+to\s+(?:strong|gale-force|storm-force|typhoon-force))?(?:\s+winds?)?$|^winds?$/i;

      const chunks = section.split(
        /^.*Potential impacts of winds.*$/im
      );
      for (const chunk of chunks) {
        let level: number | null = null;
        const areaLines: string[] = [];
        for (const rawLine of chunk.split("\n")) {
          const line = cleanText(rawLine)
            .replace(/(?:\s|^)-(?=\s|$)/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (!line) continue;
          const digit = /^([1-5])$/.exec(line);
          if (digit?.[1]) {
            level = Number(digit[1]);
            continue;
          }
          if (LABEL_LINE.test(line)) continue;
          areaLines.push(line);
        }
        const areaText = cleanText(areaLines.join(" "));
        if (!areaText || level === null) continue;
        const parsed = parseAreaListSimple(areaText);
        signals.push({ signalLevel: level, areas: parsed.areas });
      }
      signals.sort((a, b) => b.signalLevel - a.signalLevel);
    }
  }

  return {
    source: "pdf",
    bulletinNumber: num.bulletinNumber,
    isFinal: num.isFinal,
    pagasaName: name.pagasaName,
    internationalName: name.internationalName,
    category: name.category,
    categoryRaw: name.categoryRaw,
    issuedAt,
    nextBulletinAt,
    headline,
    center,
    maxWindsKph: intensity.maxWindsKph,
    gustinessKph: intensity.gustinessKph,
    pressureHpa: intensity.pressureHpa,
    movementDirection: movement.direction,
    movementSpeedKph: movement.speedKph,
    signals,
  };
}
