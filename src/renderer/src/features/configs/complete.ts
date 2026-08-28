import {
  ConfigLanguage,
  SCRIPT_GLOBALS,
  SCRIPT_KEYWORDS,
  tokenizeConfig,
} from "./highlight";

export type CompletionKind = "literal" | "key" | "keyword";

export interface Completion {
  label: string;
  kind: CompletionKind;
}

export interface CompletionResult {
  items: Completion[];
  from: number;
  to: number;
}

export const MAX_COMPLETIONS = 8;

const WORD = /[A-Za-z0-9_$.-]/;

const LITERALS: Record<ConfigLanguage, string[]> = {
  json: ["true", "false", "null"],
  yaml: ["true", "false", "null"],
  properties: ["true", "false"],
  toml: ["true", "false"],
  script: ["true", "false", "null", "undefined"],
  text: ["true", "false"],
};

const COMMENT_MARKERS: Record<ConfigLanguage, string[]> = {
  json: ["//"],
  yaml: ["#"],
  properties: ["#", "!", "//"],
  toml: ["#"],
  script: ["//"],
  text: [],
};

const VALUE_SEPARATORS: Record<ConfigLanguage, string[]> = {
  json: [":"],
  yaml: [":"],
  properties: ["=", ":"],
  toml: ["="],
  script: [],
  text: ["=", ":"],
};

export function currentWord(
  content: string,
  caret: number,
): { word: string; from: number } {
  let from = Math.max(0, Math.min(caret, content.length));

  while (from > 0 && WORD.test(content[from - 1])) from -= 1;

  return { word: content.slice(from, caret), from };
}

export function lineBeforeCaret(content: string, caret: number): string {
  const start = content.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  return content.slice(start, caret);
}

export function isCommentLine(line: string, language: ConfigLanguage): boolean {
  const trimmed = line.trimStart();
  return COMMENT_MARKERS[language].some((marker) => trimmed.startsWith(marker));
}

export function isValueContext(
  line: string,
  language: ConfigLanguage,
): boolean {
  return VALUE_SEPARATORS[language].some((separator) =>
    line.includes(separator),
  );
}

function cleanKey(text: string): string {
  return text.trim().replace(/^["']|["']$/g, "").replace(/["']?\s*:$/, "");
}

export function collectKeys(
  content: string,
  language: ConfigLanguage,
): string[] {
  const seen = new Set<string>();

  for (const token of tokenizeConfig(content, language)) {
    if (token.kind !== "key") continue;

    const key = cleanKey(token.text);
    if (!key || key.length < 2 || /\s/.test(key)) continue;
    seen.add(key);
  }

  return [...seen];
}

export function collectIdentifiers(content: string): string[] {
  const seen = new Set<string>();

  for (const match of content.matchAll(/[A-Za-z_$][\w$]{2,}/g)) {
    seen.add(match[0]);
  }

  return [...seen];
}

function rank(label: string, word: string): number {
  if (label.startsWith(word)) return 0;
  if (label.toLowerCase().startsWith(word.toLowerCase())) return 1;
  return 2;
}

function pool(
  content: string,
  line: string,
  language: ConfigLanguage,
): Completion[] {
  const literals = LITERALS[language].map(
    (label): Completion => ({ label, kind: "literal" }),
  );

  if (language === "script") {
    return [
      ...literals,
      ...[...SCRIPT_KEYWORDS].map(
        (label): Completion => ({ label, kind: "keyword" }),
      ),
      ...[...SCRIPT_GLOBALS].map(
        (label): Completion => ({ label, kind: "keyword" }),
      ),
      ...collectIdentifiers(content).map(
        (label): Completion => ({ label, kind: "key" }),
      ),
    ];
  }

  if (isValueContext(line, language)) return literals;

  return [
    ...collectKeys(content, language).map(
      (label): Completion => ({ label, kind: "key" }),
    ),
    ...literals,
  ];
}

export function completionsFor(
  content: string,
  caret: number,
  language: ConfigLanguage,
): CompletionResult {
  const { word, from } = currentWord(content, caret);
  const empty: CompletionResult = { items: [], from: caret, to: caret };

  if (word.length < 2) return empty;

  const line = lineBeforeCaret(content, caret);
  if (isCommentLine(line, language)) return empty;

  const lowered = word.toLowerCase();
  const seen = new Set<string>();
  const matched: Completion[] = [];

  for (const item of pool(content, line, language)) {
    if (item.label === word) continue;
    if (seen.has(item.label)) continue;
    if (!item.label.toLowerCase().includes(lowered)) continue;

    seen.add(item.label);
    matched.push(item);
  }

  matched.sort((a, b) => {
    const byRank = rank(a.label, word) - rank(b.label, word);
    if (byRank !== 0) return byRank;
    if (a.label.length !== b.label.length) return a.label.length - b.label.length;
    return a.label.localeCompare(b.label);
  });

  return {
    items: matched.slice(0, MAX_COMPLETIONS),
    from,
    to: caret,
  };
}

export function completionPatch(
  result: CompletionResult,
  label: string,
): { from: number; to: number; insert: string; caret: number } {
  return {
    from: result.from,
    to: result.to,
    insert: label,
    caret: result.from + label.length,
  };
}
