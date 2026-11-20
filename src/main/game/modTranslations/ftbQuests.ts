import { LangEntries, needsTranslation, unitHash } from "./unitHash";

export const FTB_QUESTS_BOOK = "ftbquests:quests";
export const FTB_QUESTS_NAMESPACE = "ftbquests";
export const FTB_QUESTS_LANG_DIR = ["config", "ftbquests", "quests", "lang"];
export const FTB_QUESTS_CONTEXT = {
  name: "FTB Quests",
  description: "The quest book of this modpack: chapter and quest titles, subtitles and descriptions.",
};

type SnbtValue = string | number | boolean | SnbtValue[] | { [key: string]: SnbtValue };

const BARE = /[A-Za-z0-9._+\-]/;
const MAX_LINE_CHARS = 4000;

class SnbtReader {
  private index = 0;

  constructor(private readonly text: string) {}

  private skip(): void {
    while (this.index < this.text.length) {
      const char = this.text[this.index];
      if (/[\s,]/.test(char)) {
        this.index++;
      } else if (char === "/" && this.text[this.index + 1] === "/") {
        while (this.index < this.text.length && this.text[this.index] !== "\n") this.index++;
      } else {
        return;
      }
    }
  }

  private quoted(): string {
    const quote = this.text[this.index++];
    let out = "";
    while (this.index < this.text.length) {
      const char = this.text[this.index++];
      if (char === quote) return out;
      if (char === "\\") {
        const next = this.text[this.index++];
        out += next === "n" ? "\n" : next === "t" ? "\t" : next;
      } else {
        out += char;
      }
    }
    throw new Error("Unterminated string");
  }

  private bare(): string {
    const start = this.index;
    while (this.index < this.text.length && BARE.test(this.text[this.index])) this.index++;
    if (start === this.index) throw new Error(`Unexpected ${this.text[this.index]}`);
    return this.text.slice(start, this.index);
  }

  value(): SnbtValue {
    this.skip();
    const char = this.text[this.index];
    if (char === "{") return this.compound();
    if (char === "[") return this.list();
    if (char === '"' || char === "'") return this.quoted();
    const word = this.bare();
    if (word === "true" || word === "false") return word === "true";
    const number = Number(word.replace(/[bBsSlLfFdD]$/, ""));
    return Number.isFinite(number) ? number : word;
  }

  private compound(): { [key: string]: SnbtValue } {
    this.index++;
    const out: { [key: string]: SnbtValue } = {};
    for (;;) {
      this.skip();
      if (this.text[this.index] === "}") {
        this.index++;
        return out;
      }
      const char = this.text[this.index];
      const key = char === '"' || char === "'" ? this.quoted() : this.bare();
      this.skip();
      if (this.text[this.index] !== ":") throw new Error("Expected :");
      this.index++;
      out[key] = this.value();
    }
  }

  private list(): SnbtValue[] {
    this.index++;
    this.skip();
    if (/^[BIL];/.test(this.text.slice(this.index, this.index + 2))) this.index += 2;
    const out: SnbtValue[] = [];
    for (;;) {
      this.skip();
      if (this.text[this.index] === "]") {
        this.index++;
        return out;
      }
      if (this.index >= this.text.length) throw new Error("Unterminated list");
      out.push(this.value());
    }
  }
}

export function parseQuestLang(text: string): Record<string, SnbtValue> | null {
  try {
    const value = new SnbtReader(text.replace(/^﻿/, "")).value();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function translatable(line: string): boolean {
  const text = line.trim();
  return (
    line.length <= MAX_LINE_CHARS &&
    !/^[[{]/.test(text) &&
    needsTranslation(text.replace(/&[0-9a-fk-or]/g, ""))
  );
}

function lineKey(key: string, index: number): string {
  return `${key}#${String(index + 1).padStart(3, "0")}`;
}

export function questSegments(text: string): LangEntries {
  const table = parseQuestLang(text);
  const entries: LangEntries = {};
  if (!table) return entries;
  for (const [key, value] of Object.entries(table)) {
    if (typeof value === "string") {
      if (translatable(value)) entries[key] = value;
    } else if (Array.isArray(value)) {
      value.forEach((line, index) => {
        if (typeof line === "string" && translatable(line)) entries[lineKey(key, index)] = line;
      });
    }
  }
  return entries;
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function quoteKey(key: string): string {
  return /^[A-Za-z0-9._+\-]+$/.test(key) ? key : quote(key);
}

export function renderQuestLang(text: string, translations: LangEntries): string | null {
  const table = parseQuestLang(text);
  if (!table) return null;
  const lines: string[] = [];
  for (const key of Object.keys(table).sort()) {
    const value = table[key];
    if (typeof value === "string") {
      const translated = translations[key];
      if (translated !== undefined) lines.push(`\t${quoteKey(key)}: ${quote(translated)}`);
    } else if (Array.isArray(value) && value.every((line) => typeof line === "string")) {
      const out = (value as string[]).map((line, index) => translations[lineKey(key, index)] ?? line);
      if (!out.some((line, index) => line !== value[index])) continue;
      lines.push(`\t${quoteKey(key)}: [`, ...out.map((line) => `\t\t${quote(line)}`), "\t]");
    }
  }
  return lines.length > 0 ? `{\n${lines.join("\n")}\n}\n` : null;
}

const UNIT_MAX_KEYS = 400;
const UNIT_MAX_CHARS = 60_000;

export interface PlannedQuestUnit {
  hash: string;
  namespace: string;
  book: string;
  entries: LangEntries;
  context: { name: string; description: string };
}

export function planQuestUnits(text: string): PlannedQuestUnit[] {
  const units: PlannedQuestUnit[] = [];
  let entries: LangEntries = {};
  let keys = 0;
  let chars = 0;
  const flush = () => {
    if (keys === 0) return;
    units.push({
      hash: unitHash(entries),
      namespace: FTB_QUESTS_NAMESPACE,
      book: FTB_QUESTS_BOOK,
      entries,
      context: FTB_QUESTS_CONTEXT,
    });
    entries = {};
    keys = 0;
    chars = 0;
  };
  for (const [key, value] of Object.entries(questSegments(text)).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (keys >= UNIT_MAX_KEYS || chars + value.length > UNIT_MAX_CHARS) flush();
    entries[key] = value;
    keys++;
    chars += value.length;
  }
  flush();
  return units;
}
