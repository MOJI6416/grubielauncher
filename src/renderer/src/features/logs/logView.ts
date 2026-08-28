import { LOG_LEVELS, LogEntry, LogLevel } from "./logParse";

export type LevelCounts = Record<LogLevel, number> & { all: number };

export interface LogViewQuery {
  levels: LogLevel[];
  search: string;
  onlyMatches: boolean;
}

export const ALL_LEVELS: LogLevel[] = [...LOG_LEVELS];

export function countLevels(entries: LogEntry[]): LevelCounts {
  const counts: LevelCounts = {
    all: entries.length,
    fatal: 0,
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
  };

  for (const entry of entries) counts[entry.level] += 1;
  return counts;
}

export function entryMatches(entry: LogEntry, needle: string): boolean {
  if (entry.text.toLowerCase().includes(needle)) return true;
  if (entry.raw.toLowerCase().includes(needle)) return true;
  return entry.extra.some((line) => line.toLowerCase().includes(needle));
}

export interface LogView {
  entries: LogEntry[];
  matches: number[];
}

export function buildView(entries: LogEntry[], query: LogViewQuery): LogView {
  const needle = query.search.trim().toLowerCase();
  const levels = new Set(query.levels);
  const allLevels = levels.size === 0 || levels.size === LOG_LEVELS.length;

  const visible: LogEntry[] = [];
  const matches: number[] = [];

  for (const entry of entries) {
    if (!allLevels && !levels.has(entry.level)) continue;

    const hit = needle ? entryMatches(entry, needle) : false;
    if (needle && query.onlyMatches && !hit) continue;

    if (hit) matches.push(visible.length);
    visible.push(entry);
  }

  return { entries: visible, matches };
}

export function stepMatch(total: number, current: number, delta: number) {
  if (total <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}

export interface HighlightPart {
  text: string;
  hit: boolean;
}

export function highlight(text: string, needle: string): HighlightPart[] {
  const query = needle.trim();
  if (!query) return [{ text, hit: false }];

  const haystack = text.toLowerCase();
  const target = query.toLowerCase();

  const parts: HighlightPart[] = [];
  let cursor = 0;

  for (;;) {
    const found = haystack.indexOf(target, cursor);
    if (found === -1) break;

    if (found > cursor) {
      parts.push({ text: text.slice(cursor, found), hit: false });
    }
    parts.push({ text: text.slice(found, found + target.length), hit: true });
    cursor = found + target.length;
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}

const PROBLEM_LEVELS = new Set<LogLevel>(["fatal", "error"]);

export function problemPositions(entries: LogEntry[]): number[] {
  const positions: number[] = [];

  entries.forEach((entry, index) => {
    if (PROBLEM_LEVELS.has(entry.level)) positions.push(index);
  });

  return positions;
}

export function nextProblem(
  positions: number[],
  from: number,
  delta: number,
): number {
  if (positions.length === 0) return -1;

  if (delta > 0) {
    const found = positions.find((position) => position > from);
    return found ?? positions[0];
  }

  for (let index = positions.length - 1; index >= 0; index -= 1) {
    if (positions[index] < from) return positions[index];
  }

  return positions[positions.length - 1];
}

const NOISE =
  /Error rendering overlay|could not find refmap file|refmap|Ignoring|is deprecated/i;

export function firstProblem(entries: LogEntry[]): LogEntry | null {
  for (const entry of entries) {
    if (!PROBLEM_LEVELS.has(entry.level)) continue;
    if (!entry.text.trim()) continue;
    if (NOISE.test(entry.text)) continue;
    return entry;
  }
  return null;
}
