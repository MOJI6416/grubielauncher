export type ConfigLanguage =
  | "json"
  | "properties"
  | "toml"
  | "yaml"
  | "script"
  | "text";

export type TokenKind =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "key"
  | "punctuation"
  | "text";

export type Token = { text: string; kind: TokenKind };

const EXTENSION_LANGUAGES: Record<string, ConfigLanguage> = {
  json: "json",
  json5: "json",
  hjson: "json",
  mcmeta: "json",
  properties: "properties",
  cfg: "properties",
  conf: "properties",
  ini: "properties",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  js: "script",
  mjs: "script",
  cjs: "script",
  ts: "script",
  zs: "script",
  lua: "script",
};

export const SCRIPT_KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "new",
  "import",
  "export",
  "from",
  "class",
  "extends",
  "null",
  "true",
  "false",
  "undefined",
]);

export const SCRIPT_GLOBALS = new Set([
  "StartupEvents",
  "ServerEvents",
  "ClientEvents",
  "PlayerEvents",
  "BlockEvents",
  "ItemEvents",
  "LevelEvents",
  "NetworkEvents",
  "RecipeViewerEvents",
  "JEIEvents",
  "REIEvents",
  "Ingredient",
  "Item",
  "Block",
  "Fluid",
  "Platform",
  "Utils",
  "Text",
  "Component",
  "console",
  "event",
  "global",
]);

export function detectConfigLanguage(fileName: string): ConfigLanguage {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_LANGUAGES[extension] ?? "text";
}

function push(tokens: Token[], text: string, kind: TokenKind): void {
  if (!text) return;

  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) {
    last.text += text;
    return;
  }

  tokens.push({ text, kind });
}

function tokenizeLineComment(
  tokens: Token[],
  line: string,
  markers: string[],
): boolean {
  const trimmed = line.trimStart();
  if (!markers.some((marker) => trimmed.startsWith(marker))) return false;

  push(tokens, line, "comment");
  return true;
}

function tokenizeValue(tokens: Token[], value: string): void {
  const trimmed = value.trim();

  if (trimmed === "true" || trimmed === "false") {
    push(tokens, value, "keyword");
    return;
  }

  if (trimmed !== "" && Number.isFinite(Number(trimmed))) {
    push(tokens, value, "number");
    return;
  }

  push(tokens, value, "string");
}

function tokenizeKeyValueLine(
  tokens: Token[],
  line: string,
  separators: string[],
): void {
  const index = separators
    .map((separator) => line.indexOf(separator))
    .filter((position) => position > 0)
    .sort((a, b) => a - b)[0];

  if (index === undefined) {
    push(tokens, line, "text");
    return;
  }

  push(tokens, line.slice(0, index), "key");
  push(tokens, line[index], "punctuation");
  tokenizeValue(tokens, line.slice(index + 1));
}

function tokenizeJson(source: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(\/\/[^\n]*)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\],:])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    push(tokens, source.slice(lastIndex, match.index), "text");
    lastIndex = match.index + match[0].length;

    if (match[1]) push(tokens, match[1], "key");
    else if (match[2]) push(tokens, match[2], "string");
    else if (match[3]) push(tokens, match[3], "comment");
    else if (match[4]) push(tokens, match[4], "number");
    else if (match[5]) push(tokens, match[5], "keyword");
    else push(tokens, match[6], "punctuation");
  }

  push(tokens, source.slice(lastIndex), "text");
  return tokens;
}

function tokenizeScript(source: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    push(tokens, source.slice(lastIndex, match.index), "text");
    lastIndex = match.index + match[0].length;

    if (match[1]) push(tokens, match[1], "comment");
    else if (match[2]) push(tokens, match[2], "string");
    else if (match[3]) push(tokens, match[3], "number");
    else if (SCRIPT_KEYWORDS.has(match[4])) push(tokens, match[4], "keyword");
    else push(tokens, match[4], "text");
  }

  push(tokens, source.slice(lastIndex), "text");
  return tokens;
}

function tokenizeLines(
  source: string,
  handler: (tokens: Token[], line: string) => void,
): Token[] {
  const tokens: Token[] = [];
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    handler(tokens, line);
    if (index < lines.length - 1) push(tokens, "\n", "text");
  });

  return tokens;
}

export function tokenizeConfig(
  source: string,
  language: ConfigLanguage,
): Token[] {
  if (language === "json") return tokenizeJson(source);
  if (language === "script") return tokenizeScript(source);

  if (language === "properties") {
    return tokenizeLines(source, (tokens, line) => {
      if (tokenizeLineComment(tokens, line, ["#", "!", "//"])) return;
      tokenizeKeyValueLine(tokens, line, ["=", ":"]);
    });
  }

  if (language === "toml") {
    return tokenizeLines(source, (tokens, line) => {
      if (tokenizeLineComment(tokens, line, ["#"])) return;

      if (line.trimStart().startsWith("[")) {
        push(tokens, line, "keyword");
        return;
      }

      tokenizeKeyValueLine(tokens, line, ["="]);
    });
  }

  if (language === "yaml") {
    return tokenizeLines(source, (tokens, line) => {
      if (tokenizeLineComment(tokens, line, ["#"])) return;

      const dashMatch = /^(\s*)(-\s+)/.exec(line);
      if (dashMatch) {
        push(tokens, dashMatch[1], "text");
        push(tokens, dashMatch[2], "punctuation");
        tokenizeKeyValueLine(tokens, line.slice(dashMatch[0].length), [":"]);
        return;
      }

      tokenizeKeyValueLine(tokens, line, [":"]);
    });
  }

  return [{ text: source, kind: "text" }];
}

export function splitTokensAt(
  tokens: Token[],
  offset: number,
): [Token[], Token[]] {
  const before: Token[] = [];
  const after: Token[] = [];
  let seen = 0;

  for (const token of tokens) {
    const end = seen + token.text.length;

    if (end <= offset) before.push(token);
    else if (seen >= offset) after.push(token);
    else {
      before.push({ text: token.text.slice(0, offset - seen), kind: token.kind });
      after.push({ text: token.text.slice(offset - seen), kind: token.kind });
    }

    seen = end;
  }

  return [before, after];
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  comment: "text-faint italic",
  string: "text-success",
  number: "text-warning",
  keyword: "text-primary",
  key: "text-foreground",
  punctuation: "text-muted-foreground",
  text: "text-muted-foreground",
};
