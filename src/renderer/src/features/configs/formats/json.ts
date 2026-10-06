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

interface Scalar {
  kind: FieldKind;
  value: boolean | number | string | string[] | null;
  raw: string;
  from: number;
  to: number;
  quote?: '"' | "'";
  numberStyle?: "integer" | "float";
}

const NUMBER =
  /[+-]?(?:Infinity|NaN|0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
const IDENTIFIER = /[A-Za-z_$][\w$-]*/y;
const WORD = /[^\s,\]}:]+/y;

const LITERALS = ["true", "false", "null"];

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let edits = 0;
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
      i += 2;
      j += 2;
    } else {
      i++;
      j++;
    }
  }

  return edits + (a.length - i) + (b.length - j) <= 1;
}

function looksMistyped(word: string): boolean {
  if (/^[+-]?\.?\d/.test(word)) return true;
  return LITERALS.some(
    (literal) =>
      (word.length >= 2 && literal.startsWith(word)) ||
      withinOneEdit(word, literal),
  );
}

class JsonReader {
  index = 0;
  fields: ConfigField[] = [];
  private pending: string[] = [];

  constructor(
    private readonly text: string,
    private readonly hjson: boolean,
  ) {}

  fail(code: IssueCode, offset = this.index, detail?: string): never {
    throw new StopParsing({ code, offset, detail });
  }

  skipTrivia(collect: boolean) {
    const text = this.text;

    while (this.index < text.length) {
      const char = text[this.index];

      if (char === " " || char === "\t" || char === "\n" || char === "\r") {
        if (char === "\n" && collect && this.blankLineAhead()) {
          this.pending = [];
        }
        this.index++;
        continue;
      }

      if (char === "﻿") {
        this.index++;
        continue;
      }

      if (char === "/" && text[this.index + 1] === "/") {
        const end = text.indexOf("\n", this.index);
        const stop = end === -1 ? text.length : end;
        if (collect) this.pending.push(text.slice(this.index + 2, stop).trim());
        this.index = stop;
        continue;
      }

      if (this.hjson && char === "#") {
        const end = text.indexOf("\n", this.index);
        const stop = end === -1 ? text.length : end;
        if (collect) this.pending.push(text.slice(this.index + 1, stop).trim());
        this.index = stop;
        continue;
      }

      if (char === "/" && text[this.index + 1] === "*") {
        const end = text.indexOf("*/", this.index + 2);
        if (end === -1) this.fail("unterminatedComment");
        if (collect) {
          this.pending.push(
            ...text
              .slice(this.index + 2, end)
              .split("\n")
              .map((line) => line.replace(/^\s*\*?\s?/, "").trim())
              .filter(Boolean),
          );
        }
        this.index = end + 2;
        continue;
      }

      break;
    }
  }

  private blankLineAhead(): boolean {
    let cursor = this.index + 1;
    while (cursor < this.text.length && /[ \t\r]/.test(this.text[cursor])) {
      cursor++;
    }
    return this.text[cursor] === "\n";
  }

  takeComments(): string[] {
    const comments = this.pending.filter(Boolean);
    this.pending = [];
    return comments;
  }

  readString(): { value: string; quote: '"' | "'"; from: number; to: number } {
    const text = this.text;
    const quote = text[this.index] as '"' | "'";
    const from = this.index;
    let value = "";
    this.index++;

    while (this.index < text.length) {
      const char = text[this.index];

      if (char === quote) {
        this.index++;
        return { value, quote, from, to: this.index };
      }

      if (char === "\\") {
        const next = text[this.index + 1];
        if (next === undefined) this.fail("unterminatedString", from);
        if (next === "u") {
          const code = Number.parseInt(
            text.slice(this.index + 2, this.index + 6),
            16,
          );
          value += Number.isFinite(code) ? String.fromCharCode(code) : "";
          this.index += 6;
          continue;
        }
        value +=
          next === "n"
            ? "\n"
            : next === "t"
              ? "\t"
              : next === "r"
                ? "\r"
                : next === "\n" || next === "\r"
                  ? ""
                  : next;
        this.index += 2;
        continue;
      }

      value += char;
      this.index++;
    }

    this.fail("unterminatedString", from);
  }

  readKey(): string {
    const char = this.text[this.index];
    if (char === '"' || char === "'") return this.readString().value;

    IDENTIFIER.lastIndex = this.index;
    const match = IDENTIFIER.exec(this.text);
    if (!match) {
      if (this.index >= this.text.length) this.fail("unexpectedEnd");
      this.fail("expectedKey", this.index, this.text[this.index]);
    }
    this.index += match[0].length;
    return match[0];
  }

  readValue(path: string[]): Scalar | null {
    const text = this.text;
    const char = text[this.index];

    if (char === undefined) this.fail("unexpectedEnd");

    if (char === "{") {
      this.readObject(path);
      return null;
    }

    if (char === "[") return this.readArray(path);

    if (char === '"' || char === "'") {
      const string = this.readString();
      return {
        kind: "string",
        value: string.value,
        raw: text.slice(string.from, string.to),
        from: string.from,
        to: string.to,
        quote: string.quote,
      };
    }

    const from = this.index;

    NUMBER.lastIndex = this.index;
    const number = NUMBER.exec(text);
    if (
      number &&
      /^(?:[\s,\]}/]|$)/.test(text[this.index + number[0].length] ?? "")
    ) {
      const raw = number[0];
      this.index += raw.length;
      const parsed = /^[+-]?0[xX]/.test(raw)
        ? Number.parseInt(raw, 16)
        : Number(raw);
      return {
        kind: "number",
        value: parsed,
        raw,
        from,
        to: this.index,
        numberStyle: /[.eE]/.test(raw) ? "float" : "integer",
      };
    }

    WORD.lastIndex = this.index;
    const word = WORD.exec(text)?.[0];
    if (!word) this.fail("unexpectedChar", from, char);

    const lower = word.toLowerCase();
    if (lower === "true" || lower === "false" || lower === "null") {
      this.index += word.length;
      return {
        kind: lower === "null" ? "complex" : "boolean",
        value: lower === "null" ? null : lower === "true",
        raw: word,
        from,
        to: this.index,
      };
    }

    if (looksMistyped(lower))
      this.fail("invalidValue", from, word.slice(0, 40));

    this.index += word.length;
    return { kind: "string", value: word, raw: word, from, to: this.index };
  }

  readArray(path: string[]): Scalar {
    const text = this.text;
    const from = this.index;
    const items: Array<Scalar | null> = [];
    this.index++;

    while (true) {
      this.skipTrivia(false);
      if (this.index >= text.length) this.fail("unclosedBracket", from, "[");
      if (text[this.index] === "]") {
        this.index++;
        break;
      }

      items.push(this.readValue([...path, String(items.length)]));
      this.skipTrivia(false);

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
      (item) => item && (item.kind === "string" || item.kind === "number"),
    );

    return {
      kind: simple ? "list" : "complex",
      value: simple ? items.map((item) => String(item?.value)) : null,
      raw: text.slice(from, this.index),
      from,
      to: this.index,
    };
  }

  readObject(path: string[]) {
    const text = this.text;
    const from = this.index;
    this.index++;

    while (true) {
      this.skipTrivia(true);
      if (this.index >= text.length) this.fail("unclosedBracket", from, "{");
      if (text[this.index] === "}") {
        this.index++;
        this.takeComments();
        return;
      }

      const comments = this.takeComments();
      const key = this.readKey();
      this.skipTrivia(false);

      if (text[this.index] !== ":") {
        if (this.index >= text.length) this.fail("unexpectedEnd");
        this.fail("expectedColon", this.index, text[this.index]);
      }
      this.index++;
      this.skipTrivia(false);

      const scalar = this.readValue([...path, key]);
      if (scalar) {
        this.fields.push({
          id: fieldId(path, key),
          section: path,
          key,
          comments,
          ...scalar,
        });
      }

      this.skipTrivia(false);
      const next = text[this.index];
      if (next === ",") {
        this.index++;
        continue;
      }
      if (next === "}") {
        this.index++;
        this.takeComments();
        return;
      }
      if (next === undefined) this.fail("unclosedBracket", from, "{");
      if (this.hjson && (next === "\n" || /[\w"']/.test(next))) continue;
      this.fail("expectedComma", this.index, next);
    }
  }
}

export function parseJsonDocument(text: string, hjson = false): ParseResult {
  const reader = new JsonReader(text, hjson);

  try {
    reader.skipTrivia(true);
    if (reader.index >= text.length) return { issue: null, fields: [] };

    reader.takeComments();
    reader.readValue([]);
    reader.skipTrivia(false);

    if (reader.index < text.length) {
      return {
        issue: {
          code: "trailingContent",
          offset: reader.index,
          detail: text[reader.index],
        },
        fields: reader.fields,
      };
    }

    return { issue: null, fields: reader.fields };
  } catch (error) {
    if (error instanceof StopParsing) {
      return { issue: error.issue, fields: reader.fields };
    }
    throw error;
  }
}
