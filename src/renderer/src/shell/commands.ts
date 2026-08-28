export type PaletteSection =
  | "navigate"
  | "instances"
  | "accounts"
  | "actions"
  | "settings"
  | "agent";

export type PaletteMode = "all" | "actions" | "instances" | "settings" | "help";

export type Rankable = {
  id: string;
  title: string;
  section: PaletteSection;
  keywords?: string;
  disabled?: boolean;
};

export type PaletteQuery = {
  mode: PaletteMode;
  query: string;
};

const PREFIXES: Record<string, PaletteMode> = {
  ">": "actions",
  "@": "instances",
  "#": "settings",
  "?": "help",
};

const MODE_SECTIONS: Record<PaletteMode, PaletteSection[] | null> = {
  all: null,
  actions: ["actions", "agent"],
  instances: ["instances"],
  settings: ["settings"],
  help: [],
};

export function parsePaletteQuery(raw: string): PaletteQuery {
  const value = raw ?? "";
  const mode = PREFIXES[value.slice(0, 1)];

  if (!mode) return { mode: "all", query: value.trim() };

  return { mode, query: value.slice(1).trim() };
}

export function sectionsForMode(mode: PaletteMode): PaletteSection[] | null {
  return MODE_SECTIONS[mode];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

const MIN_FUZZY_STREAK = 3;
const WORD_BREAKS = " -/.";

function subsequenceScore(haystack: string, needle: string): number | null {
  let index = 0;
  let hits = 0;
  let streak = 0;
  let best = 0;
  let clean = true;

  for (let position = 0; position < haystack.length; position += 1) {
    if (index >= needle.length) break;

    if (haystack[position] === needle[index]) {
      const atWordStart =
        position === 0 || WORD_BREAKS.includes(haystack[position - 1]);
      if (!atWordStart && streak === 0) clean = false;

      index += 1;
      hits += 1;
      streak += 1;
      best = Math.max(best, streak);
      continue;
    }

    streak = 0;
  }

  if (index < needle.length) return null;
  if (!clean && best < MIN_FUZZY_STREAK) return null;

  return hits + best * 2;
}

function wordStarts(haystack: string): number[] {
  const starts: number[] = [0];

  for (let index = 1; index < haystack.length; index += 1) {
    const previous = haystack[index - 1];
    if (previous === " " || previous === "-" || previous === "/") {
      starts.push(index);
    }
  }

  return starts;
}

export function scoreCommand(command: Rankable, query: string): number | null {
  const needle = normalize(query);
  const title = normalize(command.title);
  const keywords = normalize(command.keywords ?? "");

  if (needle === "") return 0;

  let score: number | null = null;

  if (title === needle) score = 1000;
  else if (title.startsWith(needle)) score = 700;
  else if (wordStarts(title).some((start) => title.startsWith(needle, start))) {
    score = 500;
  } else if (title.includes(needle)) score = 350;

  if (score === null && keywords !== "") {
    if (keywords.startsWith(needle)) score = 300;
    else if (
      wordStarts(keywords).some((start) => keywords.startsWith(needle, start))
    ) {
      score = 260;
    } else if (keywords.includes(needle)) score = 200;
  }

  if (score === null) {
    const fuzzy = subsequenceScore(title, needle);
    if (fuzzy !== null) score = 100 + fuzzy;
  }

  if (score === null && keywords !== "") {
    const fuzzy = subsequenceScore(keywords, needle);
    if (fuzzy !== null) score = 60 + fuzzy;
  }

  if (score === null) return null;

  return score + Math.max(0, 40 - title.length);
}

export function usageBoost(usage: number | undefined): number {
  if (!usage || usage <= 0) return 0;
  return Math.min(usage, 12) * 14;
}

export function rankCommands<T extends Rankable>(
  commands: readonly T[],
  raw: string,
  usage: Record<string, number> = {},
  limit = 40,
): T[] {
  const { mode, query } = parsePaletteQuery(raw);
  const sections = sectionsForMode(mode);

  const scored: { command: T; score: number; index: number }[] = [];

  commands.forEach((command, index) => {
    if (sections && !sections.includes(command.section)) return;

    const score = scoreCommand(command, query);
    if (score === null) return;

    scored.push({
      command,
      index,
      score:
        score + usageBoost(usage[command.id]) + (command.disabled ? -500 : 0),
    });
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  return scored.slice(0, limit).map((entry) => entry.command);
}

export function groupBySection<T extends Rankable>(
  commands: readonly T[],
): { section: PaletteSection; commands: T[] }[] {
  const groups = new Map<PaletteSection, T[]>();

  for (const command of commands) {
    const list = groups.get(command.section) ?? [];
    list.push(command);
    groups.set(command.section, list);
  }

  return [...groups.entries()].map(([section, list]) => ({
    section,
    commands: list,
  }));
}

export function matchRanges(title: string, query: string): [number, number][] {
  const needle = normalize(query);
  if (needle === "") return [];

  const haystack = title.toLowerCase();
  const direct = haystack.indexOf(needle);
  if (direct >= 0) return [[direct, direct + needle.length]];

  const ranges: [number, number][] = [];
  let index = 0;

  for (let position = 0; position < title.length; position += 1) {
    if (index >= needle.length) break;
    if (haystack[position] !== needle[index]) continue;

    const last = ranges[ranges.length - 1];
    if (last && last[1] === position) last[1] = position + 1;
    else ranges.push([position, position + 1]);

    index += 1;
  }

  return index >= needle.length ? ranges : [];
}
