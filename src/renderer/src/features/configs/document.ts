import { parseForgeCfg, isForgeCfg } from "./formats/forgeCfg";
import { parseJsonDocument } from "./formats/json";
import { parsePropertiesDocument } from "./formats/properties";
import { parseTomlDocument } from "./formats/toml";
import { parseYamlDocument } from "./formats/yaml";

export type ConfigFormat =
  | "json"
  | "toml"
  | "properties"
  | "ini"
  | "forge-cfg"
  | "yaml";

export type IssueCode =
  | "unexpectedEnd"
  | "unexpectedChar"
  | "expectedColon"
  | "expectedComma"
  | "expectedEquals"
  | "expectedKey"
  | "expectedValue"
  | "unterminatedString"
  | "unterminatedComment"
  | "invalidValue"
  | "duplicateKey"
  | "unclosedBracket"
  | "unexpectedClose"
  | "trailingContent"
  | "invalidHeader"
  | "tabIndent";

export interface SyntaxIssue {
  offset: number;
  code: IssueCode;
  detail?: string;
}

export type FieldKind = "boolean" | "number" | "string" | "list" | "complex";

export type FieldValue = boolean | number | string | string[] | null;

export interface ConfigField {
  id: string;
  section: string[];
  key: string;
  kind: FieldKind;
  value: FieldValue;
  raw: string;
  from: number;
  to: number;
  comments: string[];
  quote?: '"' | "'";
  numberStyle?: "integer" | "float";
}

export interface ConfigDocument {
  format: ConfigFormat;
  issue: SyntaxIssue | null;
  fields: ConfigField[];
}

export interface ParseResult {
  issue: SyntaxIssue | null;
  fields: ConfigField[];
}

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function detectFormat(
  fileName: string,
  text: string,
): ConfigFormat | null {
  const extension = extensionOf(fileName);

  if (["json", "json5", "hjson", "mcmeta"].includes(extension)) return "json";
  if (extension === "toml") return "toml";
  if (extension === "yaml" || extension === "yml") return "yaml";
  if (extension === "properties") return "properties";
  if (extension === "cfg" && isForgeCfg(text)) return "forge-cfg";
  if (["cfg", "ini", "conf"].includes(extension)) return "ini";

  return null;
}

export function parseConfigDocument(
  text: string,
  fileName: string,
): ConfigDocument | null {
  const format = detectFormat(fileName, text);
  if (!format) return null;

  const result =
    format === "json"
      ? parseJsonDocument(text, extensionOf(fileName) === "hjson")
      : format === "toml"
        ? parseTomlDocument(text)
        : format === "yaml"
          ? parseYamlDocument(text)
          : format === "forge-cfg"
            ? parseForgeCfg(text)
            : parsePropertiesDocument(text, format);

  return { format, ...result };
}

export function positionAt(
  text: string,
  offset: number,
): { line: number; column: number } {
  let line = 0;
  let lineStart = 0;
  const end = Math.max(0, Math.min(offset, text.length));

  for (let index = 0; index < end; index++) {
    if (text.charCodeAt(index) === 10) {
      line++;
      lineStart = index + 1;
    }
  }

  return { line, column: end - lineStart };
}

export function fieldId(section: string[], key: string): string {
  return [...section, key].join("\u0000");
}

function keepCase(raw: string, value: boolean): string {
  const word = value ? "true" : "false";
  if (raw === raw.toUpperCase() && /[A-Z]/.test(raw)) return word.toUpperCase();
  if (/^[A-Z]/.test(raw)) return word[0].toUpperCase() + word.slice(1);
  return word;
}

function formatNumber(field: ConfigField, value: number): string {
  if (field.numberStyle === "float" && Number.isInteger(value)) {
    return value.toFixed(1);
  }
  if (field.numberStyle === "integer") return String(Math.trunc(value));
  return String(value);
}

function basicQuoted(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}"`;
}

const YAML_PLAIN_UNSAFE =
  /^[\s\-?:,[\]{}#&*!|>'"%@`]|:\s|\s#|\s$|^(?:true|false|null|yes|no|on|off|~)$|^[-+]?(?:\d|\.\d)/i;

function serializeString(
  format: ConfigFormat,
  field: ConfigField,
  value: string,
): string {
  if (format === "json") {
    if (field.quote === "'") {
      return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
    }
    return JSON.stringify(value);
  }

  if (format === "toml") {
    if (field.quote === "'" && !/['\n\r]/.test(value)) return `'${value}'`;
    return basicQuoted(value);
  }

  if (format === "yaml") {
    if (field.quote === "'") return `'${value.replace(/'/g, "''")}'`;
    if (field.quote === '"' || YAML_PLAIN_UNSAFE.test(value)) {
      return JSON.stringify(value);
    }
    return value;
  }

  return value.replace(/\r?\n/g, " ");
}

export function serializeFieldValue(
  format: ConfigFormat,
  field: ConfigField,
  value: boolean | number | string,
): string {
  if (typeof value === "boolean") return keepCase(field.raw, value);
  if (typeof value === "number") return formatNumber(field, value);
  return serializeString(format, field, value);
}

export function writeField(
  text: string,
  format: ConfigFormat,
  field: ConfigField,
  value: boolean | number | string,
): string {
  return (
    text.slice(0, field.from) +
    serializeFieldValue(format, field, value) +
    text.slice(field.to)
  );
}

export interface FieldHints {
  description: string[];
  min?: number;
  max?: number;
  allowed?: string[];
  defaultValue?: string;
}

const RANGE_PATTERN =
  /\brange:\s*(-?[\d.]+(?:e[+-]?\d+)?)\s*~\s*(-?[\d.]+(?:e[+-]?\d+)?)/i;
const MIN_PATTERN = /\bmin(?:imum)?:\s*(-?[\d.]+)/i;
const MAX_PATTERN = /\bmax(?:imum)?:\s*(-?[\d.]+)/i;
const DEFAULT_PATTERN = /\bdefault:\s*([^\],]+?)\s*(?:[\],]|$)/i;
const ALLOWED_PATTERN = /\b(?:allowed|valid) values:\s*(.*)$/i;
const BRACKET_HINTS = /\s*\[(?:range|default)[^\]]*\]\s*$/i;
const SAFE_LIMIT = 1e15;

function finiteLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) < SAFE_LIMIT
    ? value
    : undefined;
}

const HINT_LINE =
  /^(?:range|default|min(?:imum)?|max(?:imum)?|(?:allowed|valid) values):/i;

export function descriptionLines(
  comments: string[],
): { source: string; text: string }[] {
  return comments
    .map((comment) => comment.trim())
    .filter(
      (line) =>
        line &&
        !HINT_LINE.test(line) &&
        !/^\[(?:range|default)[^\]]*\]$/i.test(line),
    )
    .map((line) => ({
      source: line,
      text: line.replace(BRACKET_HINTS, "").trim(),
    }))
    .filter((line) => line.text);
}

export function stripHintBrackets(text: string): string {
  return text.replace(BRACKET_HINTS, "").trim();
}

export function parseDefault(
  field: ConfigField,
  raw: string,
): boolean | number | string | null {
  const value = raw.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (field.kind === "boolean") {
    if (/^(?:true|false)$/i.test(value)) return value.toLowerCase() === "true";
    return null;
  }
  if (field.kind === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (field.kind === "string") return value;
  return null;
}

export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .split(/\s+/);
  if (!words[0]) return key;
  const sentence = words
    .map((word, index) =>
      index > 0 && /^[A-Z][a-z]/.test(word) ? word.toLowerCase() : word,
    )
    .join(" ");
  return sentence[0].toUpperCase() + sentence.slice(1);
}

export function fieldHints(comments: string[]): FieldHints {
  const hints: FieldHints = { description: [] };
  let collectingAllowed = false;

  for (const comment of comments) {
    const line = comment.trim();

    const range = RANGE_PATTERN.exec(line);
    if (range) {
      hints.min = finiteLimit(range[1]);
      hints.max = finiteLimit(range[2]);
    }

    const min = MIN_PATTERN.exec(line);
    if (!range && min) hints.min = finiteLimit(min[1]);

    const max = MAX_PATTERN.exec(line);
    if (!range && max) hints.max = finiteLimit(max[1]);

    const fallback = DEFAULT_PATTERN.exec(line);
    if (fallback) hints.defaultValue = fallback[1].trim();

    const allowed = ALLOWED_PATTERN.exec(line);
    if (allowed) {
      const values = allowed[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      hints.allowed = values;
      collectingAllowed = values.length === 0;
      continue;
    }

    if (collectingAllowed && /^[A-Za-z0-9_.-]+$/.test(line)) {
      hints.allowed = [...(hints.allowed ?? []), line];
      continue;
    }
    collectingAllowed = false;

    const isHintLine =
      /^(?:range|default|min(?:imum)?|max(?:imum)?):/i.test(line) ||
      /^\[(?:range|default)[^\]]*\]$/i.test(line);
    if (isHintLine) continue;

    const description = line.replace(BRACKET_HINTS, "").trim();
    if (description) hints.description.push(description);
  }

  if (hints.allowed && hints.allowed.length < 2) delete hints.allowed;

  return hints;
}
