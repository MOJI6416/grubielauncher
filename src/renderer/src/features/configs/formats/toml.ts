import type {
  ConfigField,
  FieldKind,
  IssueCode,
  ParseResult,
  SyntaxIssue,
} from "../document";
import { fieldId } from "../document";

class StopParsing extends Error {
  constructor(readonly issue: SyntaxIssue) {
    super(issue.code);
  }
}

interface TomlValue {
  kind: FieldKind;
  value: boolean | number | string | string[] | null;
  from: number;
  to: number;
  quote?: '"' | "'";
  numberStyle?: "integer" | "float";
}

const BARE_KEY = /[A-Za-z0-9_-]+/y;
const WORD = /[^\s,\]}#]+/y;
const NUMBER =
  /^(?:[+-]?(?:inf|nan)|[+-]?0x[0-9a-fA-F](?:_?[0-9a-fA-F])*|[+-]?0o[0-7](?:_?[0-7])*|[+-]?0b[01](?:_?[01])*|[+-]?(?:0|[1-9](?:_?\d)*)(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?)$/;
const DATE =
  /^\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?$/;
const TIME = /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const TIME_AFTER_SPACE =
  / \d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?/y;

function parseNumber(raw: string): number {
  const clean = raw.replace(/_/g, "");
  if (/^[+-]?inf$/.test(clean))
    return clean.startsWith("-") ? -Infinity : Infinity;
  if (/^[+-]?nan$/.test(clean)) return Number.NaN;
  if (/^[+-]?0[xob]/.test(clean)) {
    const sign = clean.startsWith("-") ? -1 : 1;
    const body = clean.replace(/^[+-]/, "");
    const radix = body[1] === "x" ? 16 : body[1] === "o" ? 8 : 2;
    return sign * Number.parseInt(body.slice(2), radix);
  }
  return Number(clean);
}

class TomlReader {
  index = 0;
  fields: ConfigField[] = [];
  private table: string[] = [];
  private scope = "";
  private keysByScope = new Map<string, Set<string>>();
  private tables = new Set<string>();
  private arrayCounters = new Map<string, number>();
  private pending: string[] = [];

  constructor(private readonly text: string) {}

  fail(code: IssueCode, offset = this.index, detail?: string): never {
    throw new StopParsing({ code, offset, detail });
  }

  private skipSpaces() {
    while (this.text[this.index] === " " || this.text[this.index] === "\t") {
      this.index++;
    }
  }

  private skipBlank() {
    while (this.index < this.text.length) {
      const char = this.text[this.index];
      if (char === " " || char === "\t" || char === "\r" || char === "\n") {
        this.index++;
      } else if (char === "#") {
        this.skipComment();
      } else {
        break;
      }
    }
  }

  private skipComment(): string {
    const end = this.text.indexOf("\n", this.index);
    const stop = end === -1 ? this.text.length : end;
    const body = this.text.slice(this.index + 1, stop).replace(/\r$/, "");
    this.index = stop;
    return body.trim();
  }

  private expectLineEnd() {
    this.skipSpaces();
    const char = this.text[this.index];
    if (char === "#") {
      this.skipComment();
      return;
    }
    if (char === undefined || char === "\n" || char === "\r") return;
    this.fail("trailingContent", this.index, char);
  }

  private readKeyPart(): string {
    const text = this.text;
    const char = text[this.index];

    if (char === '"' || char === "'")
      return this.readSingleLineString().value as string;

    BARE_KEY.lastIndex = this.index;
    const match = BARE_KEY.exec(text);
    if (!match) {
      if (char === undefined || char === "\n" || char === "\r") {
        this.fail("expectedKey");
      }
      this.fail("unexpectedChar", this.index, char);
    }
    this.index += match[0].length;
    return match[0];
  }

  private readKeyPath(): string[] {
    const parts = [this.readKeyPart()];
    while (true) {
      this.skipSpaces();
      if (this.text[this.index] !== ".") return parts;
      this.index++;
      this.skipSpaces();
      parts.push(this.readKeyPart());
    }
  }

  private readSingleLineString(): TomlValue {
    const text = this.text;
    const quote = text[this.index] as '"' | "'";
    const from = this.index;
    let value = "";
    this.index++;

    while (this.index < text.length) {
      const char = text[this.index];
      if (char === quote) {
        this.index++;
        return { kind: "string", value, from, to: this.index, quote };
      }
      if (char === "\n" || char === "\r") this.fail("unterminatedString", from);
      if (char === "\\" && quote === '"') {
        const next = text[this.index + 1];
        value +=
          next === "n"
            ? "\n"
            : next === "t"
              ? "\t"
              : next === "r"
                ? "\r"
                : next;
        this.index += 2;
        continue;
      }
      value += char;
      this.index++;
    }

    this.fail("unterminatedString", from);
  }

  private readMultilineString(): TomlValue {
    const text = this.text;
    const delimiter = text.slice(this.index, this.index + 3);
    const from = this.index;
    const end = text.indexOf(delimiter, this.index + 3);
    if (end === -1) this.fail("unterminatedString", from);
    let close = end + 3;
    while (text[close] === delimiter[0] && close - end < 5) close++;
    this.index = close;
    return {
      kind: "complex",
      value: text.slice(from + 3, close - 3),
      from,
      to: close,
    };
  }

  private readArray(): TomlValue {
    const text = this.text;
    const from = this.index;
    const items: TomlValue[] = [];
    this.index++;

    while (true) {
      this.skipBlank();
      if (this.index >= text.length) this.fail("unclosedBracket", from, "[");
      if (text[this.index] === "]") {
        this.index++;
        break;
      }

      items.push(this.readValue());
      this.skipBlank();

      const next = text[this.index];
      if (next === ",") {
        this.index++;
        continue;
      }
      if (next === "]") {
        this.index++;
        break;
      }
      if (next === undefined) this.fail("unclosedBracket", from, "[");
      this.fail("expectedComma", this.index, next);
    }

    const simple = items.every(
      (item) => item.kind === "string" || item.kind === "number",
    );
    const singleLine = !text.slice(from, this.index).includes("\n");

    return {
      kind: simple && singleLine ? "list" : "complex",
      value: simple ? items.map((item) => String(item.value)) : null,
      from,
      to: this.index,
    };
  }

  private readInlineTable(): TomlValue {
    const text = this.text;
    const from = this.index;
    const keys = new Set<string>();
    this.index++;
    this.skipSpaces();

    if (text[this.index] === "}") {
      this.index++;
      return { kind: "complex", value: null, from, to: this.index };
    }

    while (true) {
      this.skipSpaces();
      const keyOffset = this.index;
      const key = this.readKeyPath().join(".");
      if (keys.has(key)) this.fail("duplicateKey", keyOffset, key);
      keys.add(key);

      this.skipSpaces();
      if (text[this.index] !== "=")
        this.fail("expectedEquals", this.index, text[this.index]);
      this.index++;
      this.skipSpaces();
      this.readValue();
      this.skipSpaces();

      const next = text[this.index];
      if (next === ",") {
        this.index++;
        continue;
      }
      if (next === "}") {
        this.index++;
        return { kind: "complex", value: null, from, to: this.index };
      }
      if (next === undefined || next === "\n" || next === "\r") {
        this.fail("unclosedBracket", from, "{");
      }
      this.fail("expectedComma", this.index, next);
    }
  }

  readValue(): TomlValue {
    const text = this.text;
    const char = text[this.index];
    const from = this.index;

    if (char === undefined || char === "\n" || char === "\r" || char === "#") {
      this.fail("expectedValue");
    }

    if (
      text.startsWith('"""', this.index) ||
      text.startsWith("'''", this.index)
    ) {
      return this.readMultilineString();
    }
    if (char === '"' || char === "'") return this.readSingleLineString();
    if (char === "[") return this.readArray();
    if (char === "{") return this.readInlineTable();

    WORD.lastIndex = this.index;
    let word = WORD.exec(text)?.[0] ?? "";
    if (!word) this.fail("unexpectedChar", this.index, char);

    if (word === "true" || word === "false") {
      this.index += word.length;
      return { kind: "boolean", value: word === "true", from, to: this.index };
    }

    if (NUMBER.test(word)) {
      this.index += word.length;
      return {
        kind: "number",
        value: parseNumber(word),
        from,
        to: this.index,
        numberStyle: /[.eE]|inf|nan/.test(word) ? "float" : "integer",
      };
    }

    if (DATE.test(word) || TIME.test(word)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(word)) {
        TIME_AFTER_SPACE.lastIndex = this.index + word.length;
        const time = TIME_AFTER_SPACE.exec(text);
        if (time) word += time[0];
      }
      this.index += word.length;
      return { kind: "complex", value: word, from, to: this.index };
    }

    this.fail("invalidValue", from, word.slice(0, 40));
  }

  private enterTable(path: string[], isArray: boolean, offset: number) {
    const name = path.join(".");

    if (isArray) {
      const count = (this.arrayCounters.get(name) ?? 0) + 1;
      this.arrayCounters.set(name, count);
      this.scope = `${name}#${count}`;
    } else {
      if (this.tables.has(name)) this.fail("duplicateKey", offset, `[${name}]`);
      this.tables.add(name);
      this.scope = name;
    }

    this.table = path;
  }

  private readHeader() {
    const text = this.text;
    const offset = this.index;
    const isArray = text[this.index + 1] === "[";
    this.index += isArray ? 2 : 1;
    this.skipSpaces();

    const path = this.readKeyPath();
    this.skipSpaces();

    const close = isArray ? "]]" : "]";
    if (!text.startsWith(close, this.index)) {
      this.fail("invalidHeader", this.index, text[this.index]);
    }
    this.index += close.length;

    this.enterTable(path, isArray, offset);
    this.pending = [];
    this.expectLineEnd();
  }

  private readPair() {
    const keyOffset = this.index;
    const keyPath = this.readKeyPath();
    this.skipSpaces();

    if (this.text[this.index] !== "=") {
      const char = this.text[this.index];
      this.fail("expectedEquals", this.index, char);
    }
    this.index++;
    this.skipSpaces();

    const value = this.readValue();
    const comments = this.pending;
    this.pending = [];

    const name = keyPath.join(".");
    const keys = this.keysByScope.get(this.scope) ?? new Set<string>();
    if (keys.has(name)) this.fail("duplicateKey", keyOffset, name);
    keys.add(name);
    this.keysByScope.set(this.scope, keys);

    const section = [...this.table, ...keyPath.slice(0, -1)];
    const key = keyPath[keyPath.length - 1];

    this.fields.push({
      id: fieldId(section, key),
      section,
      key,
      comments,
      raw: this.text.slice(value.from, value.to),
      ...value,
    });

    this.expectLineEnd();
  }

  parse() {
    const text = this.text;
    let blankRun = 0;

    while (this.index < text.length) {
      const char = text[this.index];

      if (char === " " || char === "\t" || char === "\r" || char === "﻿") {
        this.index++;
        continue;
      }

      if (char === "\n") {
        blankRun++;
        if (blankRun > 1) this.pending = [];
        this.index++;
        continue;
      }

      blankRun = 0;

      if (char === "#") {
        this.pending.push(this.skipComment());
        blankRun = 0;
        continue;
      }

      if (char === "[") {
        this.readHeader();
        continue;
      }

      this.readPair();
    }
  }
}

export function parseTomlDocument(text: string): ParseResult {
  const reader = new TomlReader(text);

  try {
    reader.parse();
    return { issue: null, fields: reader.fields };
  } catch (error) {
    if (error instanceof StopParsing) {
      return { issue: error.issue, fields: reader.fields };
    }
    throw error;
  }
}
