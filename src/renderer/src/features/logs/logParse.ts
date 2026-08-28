export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug";

export const LOG_LEVELS: readonly LogLevel[] = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
];

export interface LogEntry {
  id: number;
  line: number;
  level: LogLevel;
  time: string;
  thread: string;
  source: string;
  text: string;
  raw: string;
  extra: string[];
  repeat: number;
}

const LEVEL_ALIASES: Record<string, LogLevel> = {
  FATAL: "fatal",
  SEVERE: "fatal",
  CRIT: "fatal",
  CRITICAL: "fatal",
  ERROR: "error",
  ERR: "error",
  WARN: "warn",
  WARNING: "warn",
  INFO: "info",
  NOTICE: "info",
  CONFIG: "info",
  DEBUG: "debug",
  TRACE: "debug",
  FINE: "debug",
  FINER: "debug",
  FINEST: "debug",
};

const CLOCK = /\d{1,2}:\d{2}:\d{2}/;
const BARE_LEVEL = /^\[([A-Za-z]{3,8})\]\s?:?\s?/;
const CONTINUATION =
  /^(?:\s|\tat\s|at\s[\w$.]+\(|Caused by:|Suppressed:|\.\.\.\s\d+\s(?:more|common frames omitted))/;

export function normalizeLevel(value: string): LogLevel | null {
  const key = value.trim().toUpperCase();
  return LEVEL_ALIASES[key] ?? null;
}

function shortSource(value: string): string {
  const head = value.split("/")[0].trim();
  if (!head) return "";
  const parts = head.split(".");
  return parts[parts.length - 1] || head;
}

function readBrackets(raw: string): { groups: string[]; rest: string } {
  const groups: string[] = [];
  let cursor = 0;

  while (groups.length < 3 && raw[cursor] === "[") {
    const close = raw.indexOf("]", cursor + 1);
    if (close === -1) break;

    const body = raw.slice(cursor + 1, close);
    if (body.length > 160) break;

    groups.push(body);
    cursor = close + 1;
    while (raw[cursor] === " ") cursor += 1;
  }

  if (raw[cursor] === ":") cursor += 1;
  if (raw[cursor] === " ") cursor += 1;

  return { groups, rest: raw.slice(cursor) };
}

interface HeadParts {
  level: LogLevel | null;
  time: string;
  thread: string;
  source: string;
  text: string;
}

export function parseHead(raw: string): HeadParts {
  const bare = BARE_LEVEL.exec(raw);
  if (bare) {
    const level = normalizeLevel(bare[1]);
    if (level) {
      return {
        level,
        time: "",
        thread: "",
        source: "",
        text: raw.slice(bare[0].length),
      };
    }
  }

  const { groups, rest } = readBrackets(raw);
  if (groups.length === 0) {
    return { level: null, time: "", thread: "", source: "", text: raw };
  }

  let time = "";
  let thread = "";
  let source = "";
  let level: LogLevel | null = null;
  const tail: string[] = [];

  for (const group of groups) {
    const direct = normalizeLevel(group);
    if (direct && !level) {
      level = direct;
      continue;
    }

    const slash = group.lastIndexOf("/");
    if (slash !== -1) {
      const parsed = normalizeLevel(group.slice(slash + 1));
      if (parsed && !level) {
        level = parsed;
        thread = group.slice(0, slash);
        continue;
      }
    }

    if (!time && CLOCK.test(group)) {
      time = CLOCK.exec(group)?.[0] ?? "";
      continue;
    }

    tail.push(group);
  }

  if (!source && tail.length > 0) source = shortSource(tail[tail.length - 1]);
  if (!thread && tail.length > 1) thread = tail[0];

  return { level, time, thread, source, text: rest };
}

const FAILURE_TEXT =
  /\b[\w.$]*(?:Exception|Error)\b(?!\w)|^Caused by:|^\s*---- Minecraft Crash Report ----|^Exception in thread/;

export function guessLevel(text: string): LogLevel | null {
  return FAILURE_TEXT.test(text) ? "error" : null;
}

export function isContinuation(raw: string): boolean {
  if (!raw) return false;
  if (raw[0] === "[") return false;
  return CONTINUATION.test(raw);
}

export function parseLogText(
  text: string,
  fallback: LogLevel = "info",
): LogEntry[] {
  const entries: LogEntry[] = [];
  if (!text) return entries;

  const lines = text.split("\n");
  const prefixed: boolean[] = [];
  let id = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].replace(/\r$/, "");
    if (!raw.trim()) continue;

    const last = entries[entries.length - 1];
    const startsRecord = raw[0] === "[";

    if (
      last &&
      !startsRecord &&
      (isContinuation(raw) || prefixed[prefixed.length - 1])
    ) {
      last.extra.push(raw);
      continue;
    }

    const head = parseHead(raw);
    entries.push({
      id,
      line: index + 1,
      level: head.level ?? guessLevel(head.text) ?? fallback,
      time: head.time,
      thread: head.thread,
      source: head.source,
      text: head.text,
      raw,
      extra: [],
      repeat: 1,
    });
    prefixed.push(head.level !== null);
    id += 1;
  }

  return entries;
}

export function collapseRepeats(entries: LogEntry[]): LogEntry[] {
  const collapsed: LogEntry[] = [];

  for (const entry of entries) {
    const last = collapsed[collapsed.length - 1];

    if (
      last &&
      last.extra.length === 0 &&
      entry.extra.length === 0 &&
      last.level === entry.level &&
      last.text === entry.text &&
      entry.text.length > 0
    ) {
      collapsed[collapsed.length - 1] = { ...last, repeat: last.repeat + 1 };
      continue;
    }

    collapsed.push(entry);
  }

  return collapsed;
}

export function mergeEntryLists(lists: LogEntry[][]): LogEntry[] {
  const merged: LogEntry[] = [];
  let line = 0;

  for (const list of lists) {
    for (const entry of list) {
      line += 1;
      merged.push({ ...entry, id: merged.length, line });
      line += entry.extra.length;
    }
  }

  return merged;
}

export function entryText(entry: LogEntry): string {
  return entry.extra.length
    ? `${entry.raw}\n${entry.extra.join("\n")}`
    : entry.raw;
}

export function entriesToText(entries: LogEntry[]): string {
  return entries.map(entryText).join("\n");
}
